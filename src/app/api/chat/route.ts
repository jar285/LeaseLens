import type {
  MessageParam,
  TextBlock,
  Tool,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAnthropicClient } from '@/lib/anthropic/client';
import { DEMO_USERS } from '@/lib/auth/constants';
import { ensureDemoUsersExist } from '@/lib/auth/ensure-demo-users';
import { decrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { buildContextWindow } from '@/lib/chat/context-window';
import {
  type ActiveLeaseSummary,
  buildSystemPrompt,
} from '@/lib/chat/system-prompt';
import { db } from '@/lib/db';
import { checkAndIncrementRateLimit } from '@/lib/db/rate-limit';
import { isSpendCeilingExceeded, recordSpend } from '@/lib/db/spend';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/http/error-response';
import { getLease } from '@/lib/lease/queries';
import { resolveLeaseId } from '@/lib/lease/resolve-lease-id';
import { logger } from '@/lib/log/logger';
import { requestIdFrom } from '@/lib/log/request-id';
import { retrieve } from '@/lib/rag/retrieve';
import { createToolRegistry } from '@/lib/tools/create-registry';
import type { AnthropicTool } from '@/lib/tools/domain';
import { toSafeToolError } from '@/lib/tools/safe-tool-error';
import {
  decodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { getActiveWorkspace } from '@/lib/workspaces/queries';

export const runtime = 'nodejs';

const chatRequestBodySchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().nullable().optional(),
  // Sprint 32.1 — when true, the route applies Anthropic
  // tool_choice:{type:'any'} on the FIRST iteration so the model
  // cannot return a text-only hallucinated "scan complete" reply
  // instead of calling extract_clauses. Subsequent iterations use
  // the default 'auto' so the model can stop when grading is done.
  // Set by AutoScanRunner; regular FAB chat omits it.
  forceScan: z.boolean().optional(),
  // Sprint 33.0 — when true, the route IGNORES any conversationId
  // in the body and ALWAYS creates a fresh conversation row. This is
  // the canonical "new lease scan started" signal: AutoScanRunner
  // sets it so a prior conversation's tool blocks never bleed into
  // a freshly-uploaded lease's Q&A. The flag is separate from
  // forceScan (composable, no implicit coupling).
  startNewConversation: z.boolean().optional(),
});

const SPEND_CEILING_MESSAGE =
  'Daily demo quota reached. Clone the repo for unlimited local use: github.com/jar285/leaselens';

// Maximum tool-use iterations per turn. Bumped from 3 → 15 in Sprint 13
// (charter v1.13) to support per-clause grading flows on a 13-clause lease
// (1 extract_clauses + N grade_clause_severity calls). Cost guard remains
// the daily spend ceiling, not this cap. See agent-guidelines §1 Anthropic SDK.
const MAX_TOOL_ITERATIONS = 15;

// Output ceiling per Anthropic call. 8192 is the documented max for Haiku
// 4.5 (the default LEASELENS_ANTHROPIC_MODEL) and well within Sonnet's
// limit too, so we can keep one constant for both paths. Sprint 13's
// original value was 1024, which silently truncated standard-scan
// summaries with 12+ clauses — Anthropic returned `stop_reason: "max_tokens"`
// and the client never knew. Anthropic only bills the tokens actually
// generated, not the cap, so raising the ceiling has no cost impact on
// shorter turns. The `'max_tokens'` stop_reason is surfaced to the
// client as a `truncated` event so the user sees a clear notice when it
// still happens (e.g. a 20-clause lease with verbose grading).
const MAX_OUTPUT_TOKENS = 8192;

/**
 * Append `addition` to `existing`, inserting a paragraph separator between
 * them so cross-iteration text blocks don't smush together (e.g.
 * "...NJ tenant law.Good — 15 clauses extracted..."). Empty additions
 * pass through unchanged so we don't leave trailing separators.
 */
function appendWithSeparator(
  existing: string,
  addition: string,
  separator = '\n\n',
): string {
  if (!addition) return existing;
  return existing ? `${existing}${separator}${addition}` : addition;
}

/**
 * Build Anthropic-formatted messages from history.
 *
 * Phase 10.8.3 — persisted tool_use and tool_result rows now produce
 * PROPER Anthropic content blocks (`{type:'tool_use', ...}` /
 * `{type:'tool_result', ...}`) instead of fake `[Tool use: <name>]`
 * placeholder strings. The model was mirroring the placeholder
 * pattern into its own text output ("Editorial Assistant: …
 * [Tool use: grade_clause_severity]") because between iterations the
 * route re-read history and converted prior tool calls to plain
 * bracketed text. With real content blocks, the model sees its own
 * structured tool_use parts in history and never produces the
 * placeholder text again.
 */
function buildMessagesForAnthropic(
  history: { role: 'user' | 'assistant' | 'tool'; content: string }[],
): Array<{
  role: 'user' | 'assistant';
  content: string | unknown[];
}> {
  return history.map((h) => {
    if (h.role === 'tool') {
      try {
        const parsed = JSON.parse(h.content);
        if (parsed.tool_result) {
          return {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: parsed.tool_result.id,
                content:
                  typeof parsed.tool_result.result === 'string'
                    ? parsed.tool_result.result
                    : JSON.stringify(parsed.tool_result.result),
              },
            ],
          };
        }
      } catch {
        // Fall through to plain text — keeps cross-version DB
        // compatibility for any rows persisted in older formats.
      }
    }
    if (h.role === 'assistant') {
      try {
        const parsed = JSON.parse(h.content);
        if (parsed.tool_use) {
          return {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: parsed.tool_use.id,
                name: parsed.tool_use.name,
                input: parsed.tool_use.input,
              },
            ],
          };
        }
      } catch {
        // Regular assistant text message — leave as-is.
      }
    }
    return { role: h.role === 'tool' ? 'user' : h.role, content: h.content };
  });
}

export async function POST(req: NextRequest) {
  // Sprint 44A.2 — request-scoped logger carrying the correlation id the
  // middleware forwarded. In scope for both the RAG-failure warning and the
  // top-level error catch below. The `err` serializer scrubs any PII-bearing
  // message/stack; we never log raw lease/clause content.
  const requestId = requestIdFrom(req.headers);
  const log = logger.child({ requestId });
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch (_e) {
      return errorResponse('VALIDATION', {
        requestId,
        message: 'Invalid or missing JSON body',
      });
    }

    const parsedBody = chatRequestBodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return errorResponse('VALIDATION', {
        requestId,
        message: 'Message is required',
      });
    }
    const { message, conversationId, forceScan, startNewConversation } =
      parsedBody.data;

    // Resolve userId and role from session cookie; fall back to default Creator
    const sessionCookie = req.cookies.get('leaselens_session');
    let userId = DEMO_USERS.find((u) => u.role === 'Tenant')?.id;
    let role: Role = 'Tenant';

    if (sessionCookie) {
      const payload = await decrypt(sessionCookie.value);
      if (payload?.userId) {
        userId = payload.userId;
        role = payload.role;
      }
    }

    if (!userId) {
      return errorResponse('UNAUTHENTICATED', {
        requestId,
        message: 'Unauthorized',
      });
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
      ensureDemoUsersExist(db);
    }

    // Initialize tool registry and get role-scoped tools
    const toolRegistry = createToolRegistry(db);
    const availableTools: AnthropicTool[] = toolRegistry.getToolsForRole(role);

    // Sprint 25.1 (R2) — Anthropic prompt-cache breakpoint on the LAST
    // tool definition. Cache hierarchy is tools → system → messages, so
    // marking the trailing entry caches the entire tools-array prefix.
    // Tools are sorted alphabetically in toolRegistry.getToolsForRole
    // (registry.ts:49), so "last" is deterministic across requests.
    const toolsForRequest =
      availableTools.length > 0
        ? availableTools.map((t, i, arr) =>
            i === arr.length - 1
              ? { ...t, cache_control: { type: 'ephemeral' as const } }
              : t,
          )
        : undefined;

    // Demo-only guardrails
    let quotaRemaining: number | null = null;

    if (env.LEASELENS_DEMO_MODE) {
      const rateLimit = checkAndIncrementRateLimit(userId);
      if (!rateLimit.allowed) {
        return errorResponse('RATE_LIMITED', {
          requestId,
          message: 'Rate limit exceeded. Try again in the next hour.',
        });
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
    // Sprint 33.0 — when startNewConversation:true, ignore any body
    // conversationId and force-create a fresh row downstream. The
    // existing lookup-or-create branch already treats null as "create."
    let activeConversationId =
      startNewConversation === true ? null : (conversationId ?? null);
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
      return errorResponse('INTERNAL', {
        requestId,
        message: 'Failed to initialize conversation',
      });
    }

    const resolvedConversationId = activeConversationId;

    // RAG retrieval for implicit grounding (still used alongside explicit tools)
    let ragContext: Awaited<ReturnType<typeof retrieve>> = [];
    try {
      ragContext = await retrieve(message, db, { workspaceId: workspace.id });
    } catch (err) {
      log.warn({ err }, 'rag.retrieve_failed: proceeding without context');
    }

    // Phase 10.8.2 — active-lease awareness. Resolve the lease for
    // this conversation BEFORE building the system prompt so the
    // agent sees a clear "lease IS loaded" line instead of inferring
    // from absence of context. We reuse resolveLeaseId with the
    // recent-upload fallback enabled — same path the lease tools use,
    // so a lease just uploaded into the side pane resolves into the
    // current conversation on its very first turn. The resolveLeaseId
    // call also writes the binding onto conversations.active_lease_id
    // so the agent's tool calls hit step 2 directly afterward (no
    // re-fallback). resolveLeaseId throws when nothing matches; that
    // is the no-lease branch and we proceed with activeLease=null.
    let activeLease: ActiveLeaseSummary | null = null;
    try {
      const leaseId = resolveLeaseId(
        db,
        {},
        {
          workspaceId: workspace.id,
          conversationId: resolvedConversationId,
          userId,
          enableRecentLeaseFallback: true,
        },
      );
      const lease = getLease(db, leaseId, workspace.id);
      if (lease) {
        const clauseCountRow = db
          .prepare(
            'SELECT COUNT(*) AS n FROM clauses WHERE lease_id = ? AND workspace_id = ?',
          )
          .get(lease.id, workspace.id) as { n: number } | undefined;
        activeLease = {
          id: lease.id,
          filename: lease.filename,
          page_count: lease.page_count,
          clause_count: clauseCountRow?.n ?? 0,
        };
      }
    } catch {
      // No lease bound and no recent upload — leave activeLease=null
      // so the prompt's no-lease branch handles it.
    }

    const systemPrompt = buildSystemPrompt({
      role,
      workspace,
      context: ragContext,
      activeLease,
    });

    // Sprint 25.1 (R2) — wrap the system prompt in a single cache-broken
    // text block so the entire system text is cached. Combined with the
    // tools-array cache breakpoint above, repeat turns within the TTL
    // pay 0.1× input price for the cached prefix per Anthropic pricing.
    const systemForRequest = [
      {
        type: 'text' as const,
        text: systemPrompt,
        cache_control: { type: 'ephemeral' as const },
      },
    ];

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
        // Sprint 32.0 — dev-only counter to diagnose "hallucinated scan" failures
        // where the model returns a text summary without ever calling tools.
        // Logged after the agentic loop ends; gated on NODE_ENV !== 'production'.
        let toolUseCount = 0;

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
                model: env.LEASELENS_ANTHROPIC_MODEL,
                system: systemForRequest,
                // Phase 10.8.3 — context-window's content-block widening
                // intentionally types content as `string | unknown[]` so
                // that file stays SDK-agnostic. The cast here re-asserts
                // the structured-block shape to the Anthropic types.
                messages: contextMessages as MessageParam[],
                max_tokens: MAX_OUTPUT_TOKENS,
                tools: toolsForRequest as Tool[] | undefined,
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
              finalResponse = appendWithSeparator(finalResponse, streamText);

              // Sprint 18 — surface output truncation. Anthropic emits
              // `stop_reason: "max_tokens"` when the model hit the cap
              // mid-token. Without this notice the client only sees a
              // chat message that abruptly ends; with it the user gets a
              // clear "response was cut short" affordance under the
              // bubble. The event is emitted before `controller.close()`
              // so the frontend processes it on the same stream.
              if (finalMessage.stop_reason === 'max_tokens') {
                log.warn(
                  {
                    conversationId: resolvedConversationId,
                    outputTokens: finalMessage.usage.output_tokens,
                    cap: MAX_OUTPUT_TOKENS,
                  },
                  'chat.response_truncated',
                );
                controller.enqueue(
                  encoder.encode(
                    `${JSON.stringify({
                      truncated: true,
                      reason: 'max_tokens',
                    })}\n`,
                  ),
                );
              }

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
                  toolUseCount += 1;
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
              //
              // Sprint 32.1 — when the client sets forceScan:true (auto-scan
              // path), require the model to call at least one tool on the
              // FIRST iteration. Without this, the model occasionally
              // hallucinates a "scan complete" text reply and never calls
              // extract_clauses (Sprint 32.0 diagnostic: tool_use_count=0).
              // Apply only on iteration 1 — once any tool has run, let the
              // model decide whether to call more or finish.
              const forceToolOnFirstIteration =
                forceScan === true && iterations === 1;
              const response = await getAnthropicClient().messages.create({
                model: env.LEASELENS_ANTHROPIC_MODEL,
                system: systemForRequest,
                // Phase 10.8.3 — context-window's content-block widening
                // intentionally types content as `string | unknown[]` so
                // that file stays SDK-agnostic. The cast here re-asserts
                // the structured-block shape to the Anthropic types.
                messages: contextMessages as MessageParam[],
                max_tokens: MAX_OUTPUT_TOKENS,
                tools: toolsForRequest as Tool[] | undefined,
                ...(forceToolOnFirstIteration
                  ? { tool_choice: { type: 'any' as const } }
                  : {}),
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
                finalResponse = appendWithSeparator(
                  finalResponse,
                  textBlock.text,
                );
              }

              if (toolUseBlocks.length > 0) {
                // Execute tools and continue loop
                for (const toolUse of toolUseBlocks) {
                  toolUseCount += 1;
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

          // Sprint 32.0 — dev-only diagnostic. Prints once per /api/chat turn
          // so we can see whether the model called tools or hallucinated a
          // text-only summary. The "look for: tool_use=0" pattern is the
          // hallucination signature (AutoScanRunner stream landed zero
          // tool_result events; right pane stays empty even though the
          // chat got a summary). Never ships to prod.
          // Sprint 44 sweep — was a NODE_ENV-gated console diag with content
          // heads (final_text_head / user_message_head = PII risk). Now a
          // structured debug log with lengths only; gated by LEASELENS_LOG_LEVEL.
          log.debug(
            {
              conversationId: resolvedConversationId,
              iterations,
              toolUseCount,
              finalTextLength: finalResponse.length,
              userMessageLength: message.length,
            },
            'chat.turn_complete',
          );

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

          // Sprint 24 hotfix — always record spend so the cockpit's
          // SpendPanel reflects reality. Previously gated by
          // LEASELENS_DEMO_MODE because the writer was conflated with
          // ceiling-enforcement; the two concerns are now separated:
          // `recordSpend` always tracks for visibility, and
          // `isSpendCeilingExceeded` still gates *enforcement* on
          // DEMO_MODE upstream.
          if (tokensIn > 0) {
            recordSpend(tokensIn, tokensOut);
          }
        } catch (error) {
          // Sprint 44B.2 — log the detail server-side (the err serializer
          // scrubs any PII-bearing message/stack), stream only a safe, generic
          // message; never the raw err.message to the client.
          log.error({ err: error }, 'chat.stream_error');
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({ error: 'The response was interrupted. Please try again.' })}\n`,
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
    log.error({ err: error }, 'chat.api_error');
    return errorResponse('INTERNAL', { requestId });
  }
}

/**
 * Execute a tool and persist the tool_use/tool_result to the database.
 *
 * Exported for the Sprint 44B.2 redaction test — it is a cohesive,
 * separately-verifiable unit (run tool → stream result → persist messages).
 */
export async function executeToolAndPersist(
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
    // Sprint 44B.2 — sanitize at the boundary: only the safe { name, code }
    // from toSafeToolError crosses into the client NDJSON stream, the persisted
    // `messages` row, and the LLM context. A raw JSON.parse SyntaxError embeds
    // the draft-email body / clause text (tenant PII) in its message. The
    // registry already logged the failure server-side (tool.execute_failed).
    const safe = toSafeToolError(err);
    toolError = safe.name;
    toolResult = { error: safe.name, code: safe.code };
  }

  // Sprint 32.2.0 — dev-only per-tool-call diagnostic. Disambiguates
  // Theory A (server-side grading errors) from Theory B (stale clause_id
  // mismatch from prior conversation history). One line per executed
  // tool; grep for `[chat-diag s32.2]`. NODE_ENV-gated.
  // Sprint 44 sweep — structured per-tool-call diagnostic (debug level). All
  // fields are IDs/enums/the safe error name (44B.2), never content.
  {
    const r = (toolResult ?? {}) as Record<string, unknown>;
    const i = (toolUse.input ?? {}) as Record<string, unknown>;
    logger.debug(
      {
        toolName: toolUse.name,
        inputClauseId: typeof i.clause_id === 'string' ? i.clause_id : null,
        resultClauseId: typeof r.clause_id === 'string' ? r.clause_id : null,
        resultSeverity: typeof r.severity === 'string' ? r.severity : null,
        hasError: toolError !== undefined,
        errName: toolError ?? null,
      },
      'tool.diag',
    );
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
