import type {
  TextBlock,
  Tool,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAnthropicClient } from '@/lib/anthropic/client';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { buildContextWindow } from '@/lib/chat/context-window';
import { buildSystemPrompt } from '@/lib/chat/system-prompt';
import { db } from '@/lib/db';
import { checkAndIncrementRateLimit } from '@/lib/db/rate-limit';
import { isSpendCeilingExceeded, recordSpend } from '@/lib/db/spend';
import { env } from '@/lib/env';
import { retrieve } from '@/lib/rag/retrieve';
import { createToolRegistry } from '@/lib/tools/create-registry';
import type { AnthropicTool } from '@/lib/tools/domain';
import {
  decodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { getActiveWorkspace } from '@/lib/workspaces/queries';

export const runtime = 'nodejs';

const chatRequestBodySchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().nullable().optional(),
});

const SPEND_CEILING_MESSAGE =
  'Daily demo quota reached. Clone the repo for unlimited local use: github.com/jar285/ContentOps';

// Maximum tool-use iterations to prevent runaway loops
const MAX_TOOL_ITERATIONS = 3;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function ensureDemoUsersExist(): void {
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
  );
  const now = Math.floor(Date.now() / 1000);
  for (const user of DEMO_USERS) {
    insertUser.run(user.id, user.email, user.role, user.display_name, now);
  }
}

/**
 * Build Anthropic-formatted messages from history.
 */
function buildMessagesForAnthropic(
  history: { role: 'user' | 'assistant' | 'tool'; content: string }[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history.map((h) => {
    if (h.role === 'tool') {
      // Tool results stored as JSON - extract for display
      try {
        const parsed = JSON.parse(h.content);
        if (parsed.tool_result) {
          return {
            role: 'user',
            content: `[Tool result: ${JSON.stringify(parsed.tool_result.result)}]`,
          };
        }
      } catch {
        // Fall through to plain text
      }
    }
    if (h.role === 'assistant') {
      // Check if this is a tool_use message
      try {
        const parsed = JSON.parse(h.content);
        if (parsed.tool_use) {
          return {
            role: 'assistant',
            content: `[Tool use: ${parsed.tool_use.name}]`,
          };
        }
      } catch {
        // Regular assistant message
      }
    }
    return { role: h.role === 'tool' ? 'user' : h.role, content: h.content };
  });
}

export async function POST(req: NextRequest) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch (_e) {
      return NextResponse.json(
        { error: 'Invalid or missing JSON body' },
        { status: 400 },
      );
    }

    const parsedBody = chatRequestBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 },
      );
    }
    const { message, conversationId } = parsedBody.data;

    // Resolve userId and role from session cookie; fall back to default Creator
    const sessionCookie = req.cookies.get('contentops_session');
    let userId = DEMO_USERS.find((u) => u.role === 'Creator')?.id;
    let role: Role = 'Creator';

    if (sessionCookie) {
      const payload = await decrypt(sessionCookie.value);
      if (payload?.userId) {
        userId = payload.userId;
        role = payload.role;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Sprint 11 (revised) — workspace cookie. If missing or expired,
    // return 401 with a redirect hint so the client can navigate home,
    // where middleware re-issues the sample cookie. /onboarding no
    // longer exists; the home page is the recovery surface.
    const workspaceCookie = req.cookies.get(WORKSPACE_COOKIE_NAME);
    const workspacePayload = workspaceCookie
      ? await decodeWorkspace(workspaceCookie.value)
      : null;
    if (!workspacePayload) {
      return NextResponse.json(
        { error: 'No workspace selected', redirect: '/' },
        { status: 401 },
      );
    }
    const workspace = getActiveWorkspace(db, workspacePayload.workspace_id);
    if (!workspace) {
      const res = NextResponse.json(
        { error: 'Workspace expired', redirect: '/' },
        { status: 401 },
      );
      res.cookies.delete(WORKSPACE_COOKIE_NAME);
      return res;
    }

    // Ensure known demo identities exist before writing (fresh-DB guard)
    const userExists = db
      .prepare('SELECT 1 FROM users WHERE id = ?')
      .get(userId);
    if (!userExists) {
      ensureDemoUsersExist();
    }

    // Initialize tool registry and get role-scoped tools
    const toolRegistry = createToolRegistry(db);
    const availableTools: AnthropicTool[] = toolRegistry.getToolsForRole(role);

    // Demo-only guardrails
    let quotaRemaining: number | null = null;

    if (env.CONTENTOPS_DEMO_MODE) {
      const rateLimit = checkAndIncrementRateLimit(userId);
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Try again in the next hour.' },
          { status: 429 },
        );
      }
      if (rateLimit.remaining <= 2) {
        quotaRemaining = rateLimit.remaining;
      }

      if (isSpendCeilingExceeded()) {
        const encoder = new TextEncoder();
        const ceilingStream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({ chunk: SPEND_CEILING_MESSAGE })}\n`,
              ),
            );
            controller.close();
          },
        });
        return new Response(ceilingStream, {
          headers: {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-cache',
          },
        });
      }
    }

    const now = Math.floor(Date.now() / 1000);

    // Persist user message and resolve/create conversation atomically.
    // Round 3 — conversation lookup AND insert are scoped to workspace_id
    // so a conversationId from a foreign workspace falls through to a fresh
    // conversation in the current workspace. Spec §20.
    let activeConversationId = conversationId ?? null;
    db.transaction(() => {
      const existingConv = activeConversationId
        ? db
            .prepare(
              'SELECT id FROM conversations WHERE id = ? AND user_id = ? AND workspace_id = ?',
            )
            .get(activeConversationId, userId, workspace.id)
        : null;

      if (!activeConversationId || !existingConv) {
        activeConversationId = crypto.randomUUID();
        db.prepare(
          'INSERT INTO conversations (id, user_id, workspace_id, title, created_at) VALUES (?, ?, ?, ?, ?)',
        ).run(
          activeConversationId,
          userId,
          workspace.id,
          'New Conversation',
          now,
        );
      }

      db.prepare(
        'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(crypto.randomUUID(), activeConversationId, 'user', message, now);
    })();

    if (!activeConversationId) {
      return NextResponse.json(
        { error: 'Failed to initialize conversation' },
        { status: 500 },
      );
    }

    const resolvedConversationId = activeConversationId;

    // RAG retrieval for implicit grounding (still used alongside explicit tools)
    let ragContext: Awaited<ReturnType<typeof retrieve>> = [];
    try {
      ragContext = await retrieve(message, db, { workspaceId: workspace.id });
    } catch (err) {
      console.error('RAG retrieval failed, proceeding without context:', err);
    }

    const systemPrompt = buildSystemPrompt({
      role,
      workspace,
      context: ragContext,
    });
    const encoder = new TextEncoder();

    const responseStream = new ReadableStream({
      async start(controller) {
        // Emit quota notice before conversationId when demo quota is low
        if (quotaRemaining !== null) {
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({ quota: { remaining: quotaRemaining } })}\n`,
            ),
          );
        }

        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ conversationId: activeConversationId })}\n`,
          ),
        );

        let iterations = 0;
        let finalResponse = '';
        let tokensIn = 0;
        let tokensOut = 0;
        let hasMoreIterations = true;

        try {
          while (hasMoreIterations && iterations < MAX_TOOL_ITERATIONS) {
            iterations++;

            // Rebuild context window from current history
            const messagesForContext = buildMessagesForAnthropic(
              db
                .prepare(
                  'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
                )
                .all(resolvedConversationId) as {
                role: 'user' | 'assistant' | 'tool';
                content: string;
              }[],
            );

            const { contextMessages } = buildContextWindow(messagesForContext);

            // Non-streaming for tool-use iterations, streaming for final text
            const isLastPossibleIteration = iterations >= MAX_TOOL_ITERATIONS;
            const useStreaming = isLastPossibleIteration;

            if (useStreaming) {
              // Streaming for final text response
              const stream = getAnthropicClient().messages.stream({
                model: env.CONTENTOPS_ANTHROPIC_MODEL,
                system: systemPrompt,
                messages: contextMessages,
                max_tokens: 1024,
                tools:
                  availableTools.length > 0
                    ? (availableTools as Tool[])
                    : undefined,
              });

              let streamText = '';
              stream.on('text', (text: string) => {
                streamText += text;
                controller.enqueue(
                  encoder.encode(`${JSON.stringify({ chunk: text })}\n`),
                );
              });

              const finalMessage = await stream.finalMessage();
              tokensIn += finalMessage.usage.input_tokens;
              tokensOut += finalMessage.usage.output_tokens;
              finalResponse += streamText;

              // Check for tool_use in streaming response (rare but possible)
              const toolUseBlocks = finalMessage.content.filter(
                (c): c is ToolUseBlock => c.type === 'tool_use',
              );

              if (
                toolUseBlocks.length > 0 &&
                iterations < MAX_TOOL_ITERATIONS
              ) {
                // Execute tools and continue loop
                for (const toolUse of toolUseBlocks) {
                  await executeToolAndPersist(
                    toolUse,
                    resolvedConversationId,
                    userId,
                    role,
                    workspace.id,
                    toolRegistry,
                    controller,
                    encoder,
                  );
                }
                continue;
              }

              // No tool_use - we're done
              hasMoreIterations = false;
            } else {
              // Non-streaming for tool-use iterations
              const response = await getAnthropicClient().messages.create({
                model: env.CONTENTOPS_ANTHROPIC_MODEL,
                system: systemPrompt,
                messages: contextMessages,
                max_tokens: 1024,
                tools:
                  availableTools.length > 0
                    ? (availableTools as Tool[])
                    : undefined,
              });

              tokensIn += response.usage.input_tokens;
              tokensOut += response.usage.output_tokens;

              const toolUseBlocks = response.content.filter(
                (c): c is ToolUseBlock => c.type === 'tool_use',
              );
              const textBlocks = response.content.filter(
                (c): c is TextBlock => c.type === 'text',
              );

              // Accumulate text content
              for (const textBlock of textBlocks) {
                if (textBlock.text) {
                  finalResponse += textBlock.text;
                }
              }

              if (toolUseBlocks.length > 0) {
                // Execute tools and continue loop
                for (const toolUse of toolUseBlocks) {
                  await executeToolAndPersist(
                    toolUse,
                    resolvedConversationId,
                    userId,
                    role,
                    workspace.id,
                    toolRegistry,
                    controller,
                    encoder,
                  );
                }
                continue;
              }

              // No tool_use - stream the accumulated text and we're done
              for (const textBlock of textBlocks) {
                if (textBlock.text) {
                  controller.enqueue(
                    encoder.encode(
                      `${JSON.stringify({ chunk: textBlock.text })}\n`,
                    ),
                  );
                }
              }
              hasMoreIterations = false;
            }
          }

          // Persist final assistant message
          if (finalResponse) {
            db.prepare(
              'INSERT INTO messages (id, conversation_id, role, content, tokens_in, tokens_out, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            ).run(
              crypto.randomUUID(),
              resolvedConversationId,
              'assistant',
              finalResponse,
              tokensIn,
              tokensOut,
              Math.floor(Date.now() / 1000),
            );
          }

          // Record spend for ceiling tracking (demo mode only)
          if (env.CONTENTOPS_DEMO_MODE && tokensIn > 0) {
            recordSpend(tokensIn, tokensOut);
          }
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({ error: getErrorMessage(error) })}\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * Execute a tool and persist the tool_use/tool_result to the database.
 */
async function executeToolAndPersist(
  toolUse: ToolUseBlock,
  conversationId: string,
  userId: string,
  role: Role,
  workspaceId: string,
  toolRegistry: ReturnType<typeof createToolRegistry>,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  const toolId = crypto.randomUUID();

  // Emit tool_use event
  controller.enqueue(
    encoder.encode(
      `${JSON.stringify({
        tool_use: {
          id: toolId,
          name: toolUse.name,
          input: toolUse.input,
        },
      })}\n`,
    ),
  );

  // Execute tool — destructure the ToolExecutionResult envelope.
  // For mutating tools, audit_id is set; for read-only tools it's undefined.
  let toolResult: unknown;
  let toolError: string | undefined;
  let auditId: string | undefined;
  try {
    const envelope = await toolRegistry.execute(
      toolUse.name,
      toolUse.input as Record<string, unknown>,
      { role, userId, conversationId, toolUseId: toolId, workspaceId },
    );
    toolResult = envelope.result;
    auditId = envelope.audit_id;
  } catch (err) {
    toolError = err instanceof Error ? err.message : 'Tool execution failed';
    toolResult = { error: toolError };
  }

  // Emit tool_result event. audit_id and compensating_available are
  // metadata about the call — present only for mutating-tool successes.
  // They never enter `result` (which is what the LLM and persisted
  // message bodies see).
  controller.enqueue(
    encoder.encode(
      `${JSON.stringify({
        tool_result: {
          id: toolId,
          name: toolUse.name,
          result: toolResult,
          error: toolError,
          ...(auditId
            ? { audit_id: auditId, compensating_available: true }
            : {}),
        },
      })}\n`,
    ),
  );

  // Persist tool messages
  const toolUseContent = JSON.stringify({
    tool_use: {
      id: toolId,
      name: toolUse.name,
      input: toolUse.input,
    },
  });
  const toolResultContent = JSON.stringify({
    tool_result: {
      id: toolId,
      result: toolResult,
    },
  });

  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    crypto.randomUUID(),
    conversationId,
    'assistant',
    toolUseContent,
    Math.floor(Date.now() / 1000),
  );

  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    crypto.randomUUID(),
    conversationId,
    'tool',
    toolResultContent,
    Math.floor(Date.now() / 1000),
  );
}
