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

export const runtime = 'nodejs';

const chatRequestBodySchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().nullable().optional(),
});

const SPEND_CEILING_MESSAGE =
  'Daily demo quota reached. Clone the repo for unlimited local use: github.com/your-org/contentop';

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

    // Ensure known demo identities exist before writing (fresh-DB guard)
    const userExists = db
      .prepare('SELECT 1 FROM users WHERE id = ?')
      .get(userId);
    if (!userExists) {
      ensureDemoUsersExist();
    }

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

    // Persist user message and resolve/create conversation atomically
    let activeConversationId = conversationId ?? null;
    db.transaction(() => {
      const existingConv = activeConversationId
        ? db
            .prepare(
              'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
            )
            .get(activeConversationId, userId)
        : null;

      if (!activeConversationId || !existingConv) {
        activeConversationId = crypto.randomUUID();
        db.prepare(
          'INSERT INTO conversations (id, user_id, title, created_at) VALUES (?, ?, ?, ?)',
        ).run(activeConversationId, userId, 'New Conversation', now);
      }

      db.prepare(
        'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(crypto.randomUUID(), activeConversationId, 'user', message, now);
    })();

    // Load full history (includes the just-persisted user message at the end)
    const history = db
      .prepare(
        'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      )
      .all(activeConversationId) as {
      role: 'user' | 'assistant';
      content: string;
    }[];

    const { contextMessages } = buildContextWindow(history);

    let ragContext: Awaited<ReturnType<typeof retrieve>> = [];
    try {
      ragContext = await retrieve(message, db);
    } catch (err) {
      console.error('RAG retrieval failed, proceeding without context:', err);
    }

    const systemPrompt = buildSystemPrompt(role, ragContext);
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

        let fullResponse = '';
        try {
          const anthropic = getAnthropicClient();
          const stream = anthropic.messages.stream({
            model: env.CONTENTOPS_ANTHROPIC_MODEL,
            system: systemPrompt,
            messages: contextMessages,
            max_tokens: 1024,
          });

          stream.on('text', (text: string) => {
            fullResponse += text;
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ chunk: text })}\n`),
            );
          });

          const finalMessage = await stream.finalMessage();
          const tokensIn = finalMessage.usage.input_tokens;
          const tokensOut = finalMessage.usage.output_tokens;

          // Persist assistant message with token counts
          db.prepare(
            'INSERT INTO messages (id, conversation_id, role, content, tokens_in, tokens_out, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(
            crypto.randomUUID(),
            activeConversationId,
            'assistant',
            fullResponse,
            tokensIn,
            tokensOut,
            Math.floor(Date.now() / 1000),
          );

          // Record spend for ceiling tracking (demo mode only)
          if (env.CONTENTOPS_DEMO_MODE) {
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
