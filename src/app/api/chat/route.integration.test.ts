import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { POST } from './route';

vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    env: {
      ...actual.env,
      get CONTENTOPS_DEMO_MODE() {
        return process.env._TEST_DEMO_MODE === 'true';
      },
    },
  };
});

vi.mock('@/lib/anthropic/client', () => ({
  getAnthropicClient: vi.fn().mockReturnValue({
    messages: {
      stream: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation(function (
          this: unknown,
          event: string,
          cb: (text: string) => void,
        ) {
          if (event === 'text') cb('Test assistant response');
          return this;
        }),
        finalMessage: vi.fn().mockResolvedValue({
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }),
    },
  }),
}));

interface ConversationRow {
  id: string;
}

interface MessageRow {
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens_in: number | null;
  tokens_out: number | null;
}

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
const BASE_URL = 'http://localhost:3000';

async function makeSessionRequest(
  message: string,
  userId = TEST_USER_ID,
  conversationId: string | null = null,
) {
  const token = await encrypt({
    userId,
    role: 'Creator' as Role,
    displayName: 'Test Creator',
  });
  const req = new NextRequest(new URL('/api/chat', BASE_URL), {
    method: 'POST',
    body: JSON.stringify({ message, conversationId }),
  });
  req.cookies.set('contentops_session', token);
  return req;
}

async function drainStream(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value);
  }
  return result;
}

describe('Chat API Persistence Integration', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM rate_limit').run();
    db.prepare('DELETE FROM spend_log').run();

    db.prepare(
      'INSERT INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(TEST_USER_ID, 'test@example.com', 'Creator', 'Test', 0);

    process.env.CONTENTOPS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
    process.env._TEST_DEMO_MODE = 'false';
  });

  afterEach(() => {
    delete process.env._TEST_DEMO_MODE;
  });

  it('creates conversation, streams response, and persists messages with token counts', async () => {
    const messageContent = 'Test persistence message';
    const req = await makeSessionRequest(messageContent);
    const res = await POST(req);
    expect(res.status).toBe(200);

    await drainStream(res);

    const convos = db
      .prepare('SELECT id FROM conversations')
      .all() as ConversationRow[];
    expect(convos).toHaveLength(1);

    const messages = db
      .prepare(
        'SELECT conversation_id, role, content, tokens_in, tokens_out FROM messages ORDER BY created_at ASC',
      )
      .all() as MessageRow[];
    expect(messages).toHaveLength(2);

    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe(messageContent);
    expect(messages[0].conversation_id).toBe(convos[0].id);

    expect(messages[1].role).toBe('assistant');
    expect(messages[1].content).toBe('Test assistant response');
    expect(messages[1].tokens_in).toBe(10);
    expect(messages[1].tokens_out).toBe(5);
  });
});

describe('Chat API Demo Guardrails', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM rate_limit').run();
    db.prepare('DELETE FROM spend_log').run();

    db.prepare(
      'INSERT INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(TEST_USER_ID, 'test@example.com', 'Creator', 'Test', 0);

    process.env.CONTENTOPS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
    process.env._TEST_DEMO_MODE = 'true';
  });

  afterEach(() => {
    delete process.env._TEST_DEMO_MODE;
  });

  it('returns 429 on the 11th message within the rate-limit window', async () => {
    // Exhaust the 10-message limit directly in the DB
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'INSERT INTO rate_limit (session_id, window_start, count) VALUES (?, ?, ?)',
    ).run(TEST_USER_ID, now, 10);

    const req = await makeSessionRequest('One too many');
    const res = await POST(req);
    expect(res.status).toBe(429);

    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Rate limit exceeded');
  });

  it('streams the spend-ceiling message when daily ceiling is exceeded', async () => {
    // Insert a spend_log row that exceeds the $2 default ceiling
    // 2_000_000 input + 500_000 output → $3.60
    db.prepare(
      "INSERT INTO spend_log (date, tokens_in, tokens_out) VALUES (date('now'), ?, ?)",
    ).run(2_000_000, 500_000);

    const req = await makeSessionRequest('Will hit ceiling');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await drainStream(res);
    expect(body).toContain('Daily demo quota reached');
  });
});
