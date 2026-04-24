import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { mockStreamGenerator } from '@/lib/mock-stream';

export const runtime = 'nodejs';

const chatRequestBodySchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().nullable().optional(),
});

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function ensureDemoUsersExist() {
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

    const sessionCookie = req.cookies.get('contentops_session');
    let userId = DEMO_USERS.find((u) => u.role === 'Creator')?.id;

    if (sessionCookie) {
      const payload = await decrypt(sessionCookie.value);
      if (payload?.userId) {
        userId = payload.userId;
      }
    }

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // On a fresh local DB, missing seeded users would trigger FK errors.
    // Ensure the known demo identities exist before writing conversations/messages.
    const selectedUserExists = db
      .prepare('SELECT 1 FROM users WHERE id = ?')
      .get(userId);
    if (!selectedUserExists) {
      ensureDemoUsersExist();
    }

    const now = Math.floor(Date.now() / 1000);

    // Run DB ops inside a transaction
    let activeConversationId = conversationId;
    db.transaction(() => {
      // Ensure conversation exists and belongs to the user
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

      const userMessageId = crypto.randomUUID();
      db.prepare(
        'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run(userMessageId, activeConversationId, 'user', message, now);
    })();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // We yield the conversation ID first so the client can update its state
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ conversationId: activeConversationId })}\n`,
          ),
        );

        let fullResponse = '';
        try {
          const generator = mockStreamGenerator(message);
          for await (const chunk of generator) {
            fullResponse += chunk;
            // Send chunk data as JSON lines or Server-Sent Events.
            // We'll use simple JSON lines.
            controller.enqueue(
              encoder.encode(`${JSON.stringify({ chunk })}\n`),
            );
          }

          // Save assistant message after stream completes
          const assistantMessageId = crypto.randomUUID();
          db.prepare(
            'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
          ).run(
            assistantMessageId,
            activeConversationId,
            'assistant',
            fullResponse,
            Math.floor(Date.now() / 1000),
          );
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

    return new Response(stream, {
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
