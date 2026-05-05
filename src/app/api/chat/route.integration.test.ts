import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
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
      // Non-streaming create() for tool-use iterations
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Test assistant response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
      }),
      // Streaming for final text response
      stream: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation(function (
          this: unknown,
          _event: string,
          _cb: (text: string) => void,
        ) {
          // Only emit via finalMessage to avoid duplication in test assertions
          return this;
        }),
        finalMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Test assistant response' }],
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
  // Sprint 11 — chat route requires a workspace cookie. Default to sample.
  const workspaceToken = await encodeWorkspace({
    workspace_id: SAMPLE_WORKSPACE.id,
    created_workspace_ids: [],
  });
  req.cookies.set(WORKSPACE_COOKIE_NAME, workspaceToken);
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

    // Sprint 11: chat route requires an active workspace. Seed sample.
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, ?, ?, 1, ?, NULL)`,
    ).run(
      SAMPLE_WORKSPACE.id,
      SAMPLE_WORKSPACE.name,
      SAMPLE_WORKSPACE.description,
      0,
    );

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

    // Sprint 11: chat route requires an active workspace. Seed sample.
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, ?, ?, 1, ?, NULL)`,
    ).run(
      SAMPLE_WORKSPACE.id,
      SAMPLE_WORKSPACE.name,
      SAMPLE_WORKSPACE.description,
      0,
    );

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

describe('Chat API Workspace Cookie Gate (Sprint 11)', () => {
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

  it('returns 401 with redirect hint when no workspace cookie is set', async () => {
    const sessionToken = await encrypt({
      userId: TEST_USER_ID,
      role: 'Creator',
      displayName: 'Test',
    });
    const req = new NextRequest(new URL('/api/chat', BASE_URL), {
      method: 'POST',
      body: JSON.stringify({ message: 'hi', conversationId: null }),
    });
    req.cookies.set('contentops_session', sessionToken);
    // Note: NO workspace cookie.
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; redirect: string };
    expect(body.error).toBe('No workspace selected');
    expect(body.redirect).toBe('/');
  });

  it('returns 401 + clears cookie when workspace decodes but no longer exists', async () => {
    const sessionToken = await encrypt({
      userId: TEST_USER_ID,
      role: 'Creator',
      displayName: 'Test',
    });
    const ghostWorkspaceToken = await encodeWorkspace({
      workspace_id: '00000000-0000-0000-0000-deadbeefffff',
      created_workspace_ids: [],
    });
    const req = new NextRequest(new URL('/api/chat', BASE_URL), {
      method: 'POST',
      body: JSON.stringify({ message: 'hi', conversationId: null }),
    });
    req.cookies.set('contentops_session', sessionToken);
    req.cookies.set(WORKSPACE_COOKIE_NAME, ghostWorkspaceToken);
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Workspace expired');
    // Set-Cookie clears the workspace cookie.
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('contentops_workspace=');
    // Cookie is cleared via Max-Age=0 or expired date.
    expect(setCookie).toMatch(/Max-Age=0|Expires=/i);
  });

  it('proceeds normally when both session and workspace cookies are valid (smoke)', async () => {
    // Seed sample workspace so getActiveWorkspace returns it.
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, ?, ?, 1, ?, NULL)`,
    ).run(
      SAMPLE_WORKSPACE.id,
      SAMPLE_WORKSPACE.name,
      SAMPLE_WORKSPACE.description,
      0,
    );
    const req = await makeSessionRequest('hello');
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe('Chat API Workspace Scoping (Sprint 11 Round 3)', () => {
  const OTHER_WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM workspaces WHERE id != ?').run(SAMPLE_WORKSPACE.id);
    db.prepare('DELETE FROM rate_limit').run();
    db.prepare('DELETE FROM spend_log').run();

    db.prepare(
      'INSERT INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(TEST_USER_ID, 'test@example.com', 'Creator', 'Test', 0);

    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, ?, ?, 1, ?, NULL)`,
    ).run(
      SAMPLE_WORKSPACE.id,
      SAMPLE_WORKSPACE.name,
      SAMPLE_WORKSPACE.description,
      0,
    );
    // Seed a SECOND workspace for cross-workspace tests.
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, 'Other', 'second workspace', 0, ?, ?)`,
    ).run(
      OTHER_WORKSPACE_ID,
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000) + 3600,
    );

    process.env.CONTENTOPS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
    process.env._TEST_DEMO_MODE = 'false';
  });

  afterEach(() => {
    delete process.env._TEST_DEMO_MODE;
  });

  it('persists workspace_id on the new conversation row', async () => {
    const req = await makeSessionRequest('first message');
    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);

    const row = db
      .prepare('SELECT workspace_id FROM conversations LIMIT 1')
      .get() as { workspace_id: string };
    expect(row.workspace_id).toBe(SAMPLE_WORKSPACE.id);
  });

  it('ignores a conversationId that belongs to a different workspace and creates a fresh one', async () => {
    // Pre-seed a conversation in the OTHER workspace.
    db.prepare(
      `INSERT INTO conversations (id, user_id, workspace_id, title, created_at)
       VALUES ('foreign-conv', ?, ?, 'old', 1)`,
    ).run(TEST_USER_ID, OTHER_WORKSPACE_ID);

    // Now post a chat with that foreign conversationId, but the cookie
    // points at the SAMPLE workspace.
    const req = await makeSessionRequest(
      'should not append to foreign conv',
      TEST_USER_ID,
      'foreign-conv',
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);

    // The foreign conversation must NOT have gained a message.
    const foreignMsgs = (
      db
        .prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?')
        .get('foreign-conv') as { c: number }
    ).c;
    expect(foreignMsgs).toBe(0);

    // A NEW conversation must exist in the sample workspace.
    const sampleConvs = db
      .prepare(
        'SELECT id FROM conversations WHERE workspace_id = ? AND id != ?',
      )
      .all(SAMPLE_WORKSPACE.id, 'foreign-conv') as { id: string }[];
    expect(sampleConvs).toHaveLength(1);
  });

  it('appends to an existing conversation when the conversationId belongs to the current workspace', async () => {
    db.prepare(
      `INSERT INTO conversations (id, user_id, workspace_id, title, created_at)
       VALUES ('own-conv', ?, ?, 'mine', 1)`,
    ).run(TEST_USER_ID, SAMPLE_WORKSPACE.id);

    const req = await makeSessionRequest(
      'append to own',
      TEST_USER_ID,
      'own-conv',
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);

    // Same conversation id, two new messages (user + assistant).
    const ownMsgs = (
      db
        .prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?')
        .get('own-conv') as { c: number }
    ).c;
    expect(ownMsgs).toBe(2);
    // No additional conversation rows.
    const totalConvs = (
      db.prepare('SELECT COUNT(*) as c FROM conversations').get() as {
        c: number;
      }
    ).c;
    expect(totalConvs).toBe(1);
  });
});
