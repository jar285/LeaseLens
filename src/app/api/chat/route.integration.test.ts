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
      get LEASELENS_DEMO_MODE() {
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
  extraBody: Record<string, unknown> = {},
) {
  const token = await encrypt({
    userId,
    role: 'Tenant' as Role,
    displayName: 'Test Creator',
  });
  const req = new NextRequest(new URL('/api/chat', BASE_URL), {
    method: 'POST',
    body: JSON.stringify({ message, conversationId, ...extraBody }),
  });
  req.cookies.set('leaselens_session', token);
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

    process.env.LEASELENS_SESSION_SECRET =
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

// Sprint 32.1 — when the request body sets forceScan:true, the FIRST
// iteration of the agentic loop must call Anthropic with
// tool_choice:{type:'any'} so the model cannot return a text-only
// hallucinated "scan complete" reply (Sprint 32.0 confirmed that's
// what was breaking the auto-scan UX). When forceScan is omitted or
// false, the request remains tool_choice-agnostic (the default 'auto')
// so regular FAB chat behaviour is unchanged.
describe('Chat API force-tool (Sprint 32.1)', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM users').run();
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

    process.env.LEASELENS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
    process.env._TEST_DEMO_MODE = 'false';
  });

  afterEach(() => {
    delete process.env._TEST_DEMO_MODE;
  });

  it('passes tool_choice:{type:"any"} to Anthropic on iteration 1 when forceScan=true', async () => {
    const { getAnthropicClient } = await import('@/lib/anthropic/client');
    // Cast through `unknown` because Anthropic's `create` has overloaded
    // signatures that confuse `vi.mocked()`; the runtime mock is a plain
    // vi.fn() (set up via vi.mock above), so the cast is safe.
    const createMock = getAnthropicClient().messages
      .create as unknown as ReturnType<typeof vi.fn>;
    createMock.mockClear();

    const req = await makeSessionRequest(
      'Run the standard scan',
      TEST_USER_ID,
      null,
      { forceScan: true },
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);

    expect(createMock).toHaveBeenCalled();
    const firstCallArgs = createMock.mock.calls[0]?.[0] as
      | { tool_choice?: { type: string } }
      | undefined;
    expect(firstCallArgs?.tool_choice).toEqual({ type: 'any' });
  });

  it('does NOT pass tool_choice when forceScan is omitted (regular chat unchanged)', async () => {
    const { getAnthropicClient } = await import('@/lib/anthropic/client');
    // Cast through `unknown` because Anthropic's `create` has overloaded
    // signatures that confuse `vi.mocked()`; the runtime mock is a plain
    // vi.fn() (set up via vi.mock above), so the cast is safe.
    const createMock = getAnthropicClient().messages
      .create as unknown as ReturnType<typeof vi.fn>;
    createMock.mockClear();

    const req = await makeSessionRequest('Hello');
    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);

    expect(createMock).toHaveBeenCalled();
    const firstCallArgs = createMock.mock.calls[0]?.[0] as
      | { tool_choice?: { type: string } }
      | undefined;
    expect(firstCallArgs?.tool_choice).toBeUndefined();
  });
});

// Sprint 33.0 — conversation scoping. When startNewConversation:true is in
// the body, the route MUST create a fresh conversation row, even if the
// body supplies a non-null conversationId. This pins the lease-A → lease-B
// isolation invariant: prior-lease tool blocks never leak into a new scan.
//
// Kent-C-Dodds-style: tests the user-visible invariant (two distinct
// conversation rows, zero message bleed) rather than implementation details.
describe('Chat API conversation scoping (Sprint 33.0)', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM users').run();
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

    process.env.LEASELENS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
    process.env._TEST_DEMO_MODE = 'false';
  });

  afterEach(() => {
    delete process.env._TEST_DEMO_MODE;
  });

  it('creates a NEW conversation when startNewConversation:true is set, ignoring any body conversationId', async () => {
    // Round 1 — establish a conversation
    const req1 = await makeSessionRequest('lease A intro', TEST_USER_ID, null, {
      startNewConversation: true,
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(200);
    await drainStream(res1);

    const convsAfterRound1 = db
      .prepare('SELECT id FROM conversations')
      .all() as ConversationRow[];
    expect(convsAfterRound1).toHaveLength(1);
    const firstConvId = convsAfterRound1[0].id;

    // Round 2 — body explicitly passes the first conversation's id AND the
    // flag. The flag MUST override and force a fresh row.
    const req2 = await makeSessionRequest(
      'lease B intro',
      TEST_USER_ID,
      firstConvId,
      { startNewConversation: true },
    );
    const res2 = await POST(req2);
    expect(res2.status).toBe(200);
    await drainStream(res2);

    const convsAfterRound2 = db
      .prepare('SELECT id FROM conversations ORDER BY created_at ASC')
      .all() as ConversationRow[];
    expect(convsAfterRound2).toHaveLength(2);
    expect(convsAfterRound2[1].id).not.toBe(firstConvId);
  });

  it('continues an EXISTING conversation when startNewConversation is omitted (regression guard)', async () => {
    // Round 1 — create conversation via the flag path
    const req1 = await makeSessionRequest('msg 1', TEST_USER_ID, null, {
      startNewConversation: true,
    });
    await drainStream(await POST(req1));
    const convs = db
      .prepare('SELECT id FROM conversations')
      .all() as ConversationRow[];
    const convId = convs[0].id;

    // Round 2 — same user/workspace, pass the conversationId, NO flag → reuse
    const req2 = await makeSessionRequest('msg 2', TEST_USER_ID, convId);
    await drainStream(await POST(req2));

    const convsAfter = db
      .prepare('SELECT id FROM conversations')
      .all() as ConversationRow[];
    expect(convsAfter).toHaveLength(1);
    expect(convsAfter[0].id).toBe(convId);
  });

  it('lease-A messages do NOT bleed into the new conversation when startNewConversation fires (Kent-C-Dodds invariant)', async () => {
    // Round 1 — lease A
    const req1 = await makeSessionRequest(
      'lease A user message — distinctive marker AAAA',
      TEST_USER_ID,
      null,
      { startNewConversation: true },
    );
    await drainStream(await POST(req1));
    const convsR1 = db
      .prepare('SELECT id FROM conversations')
      .all() as ConversationRow[];
    const convA = convsR1[0].id;

    // Round 2 — lease B; pass convA's id AND set the flag
    const req2 = await makeSessionRequest(
      'lease B user message — distinctive marker BBBB',
      TEST_USER_ID,
      convA,
      { startNewConversation: true },
    );
    await drainStream(await POST(req2));

    const convsR2 = db
      .prepare('SELECT id FROM conversations ORDER BY created_at ASC')
      .all() as ConversationRow[];
    const convB = convsR2[1].id;

    // The user-visible invariant: messages tied to conv B contain ONLY
    // lease B's content. AAAA must not appear in conv B's message table.
    const convBMessages = db
      .prepare(
        'SELECT content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      )
      .all(convB) as { content: string }[];

    for (const msg of convBMessages) {
      expect(msg.content).not.toContain('AAAA');
    }
    // And the lease A marker still lives only in conv A.
    const convAMessages = db
      .prepare(
        'SELECT content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      )
      .all(convA) as { content: string }[];
    expect(convAMessages.some((m) => m.content.includes('AAAA'))).toBe(true);
    expect(convAMessages.some((m) => m.content.includes('BBBB'))).toBe(false);
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

    process.env.LEASELENS_SESSION_SECRET =
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
    process.env.LEASELENS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
    process.env._TEST_DEMO_MODE = 'false';
  });

  afterEach(() => {
    delete process.env._TEST_DEMO_MODE;
  });

  it('returns 401 with redirect hint when no workspace cookie is set', async () => {
    const sessionToken = await encrypt({
      userId: TEST_USER_ID,
      role: 'Tenant',
      displayName: 'Test',
    });
    const req = new NextRequest(new URL('/api/chat', BASE_URL), {
      method: 'POST',
      body: JSON.stringify({ message: 'hi', conversationId: null }),
    });
    req.cookies.set('leaselens_session', sessionToken);
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
      role: 'Tenant',
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
    req.cookies.set('leaselens_session', sessionToken);
    req.cookies.set(WORKSPACE_COOKIE_NAME, ghostWorkspaceToken);
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Workspace expired');
    // Set-Cookie clears the workspace cookie.
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('leaselens_workspace=');
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

    process.env.LEASELENS_SESSION_SECRET =
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

// Sprint 25.1 — verifications for the optimizations shipped in 25.1.
// Lives here (not in the E2E suite) because:
//   T5: prompt-cache breakpoints live on the Anthropic request payload —
//       the browser can't observe usage.cache_read_input_tokens.
//   T16: truncation requires the mock to emit stop_reason='max_tokens',
//       which we won't bake into the e2e-mock to keep it minimal.
describe('Sprint 25.1 R2 — Anthropic prompt-cache breakpoints', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM users').run();
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
    process.env.LEASELENS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
    process.env._TEST_DEMO_MODE = 'false';
  });

  it('places cache_control on the system text block AND the last tool definition', async () => {
    // Capture args from messages.create — the route uses create() for
    // normal tool-iteration turns and only falls back to stream() when
    // iterations cap (rare). The cache_control assertion applies to
    // both code paths because the system+tools args are constructed
    // once outside the loop.
    const createCalls: Array<Record<string, unknown>> = [];
    const { getAnthropicClient } = await import('@/lib/anthropic/client');
    vi.mocked(getAnthropicClient).mockReturnValue({
      messages: {
        create: vi
          .fn()
          .mockImplementation(async (args: Record<string, unknown>) => {
            createCalls.push(args);
            return {
              content: [{ type: 'text', text: 'ok' }],
              usage: { input_tokens: 10, output_tokens: 5 },
              stop_reason: 'end_turn',
            };
          }),
        stream: vi.fn().mockReturnValue({
          on: vi.fn().mockReturnThis(),
          finalMessage: vi.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'ok' }],
            usage: { input_tokens: 10, output_tokens: 5 },
            stop_reason: 'end_turn',
          }),
        }),
      },
      // biome-ignore lint/suspicious/noExplicitAny: test mock shape
    } as any);

    const req = await makeSessionRequest('Hello');
    const res = await POST(req);
    expect(res.status).toBe(200);
    await drainStream(res);

    expect(createCalls.length).toBeGreaterThan(0);
    const call = createCalls[createCalls.length - 1];

    // system is an array of TextBlockParam with cache_control on the block.
    const system = call.system as Array<{
      type: string;
      text: string;
      cache_control?: { type: string };
    }>;
    expect(Array.isArray(system)).toBe(true);
    expect(system.length).toBeGreaterThan(0);
    const lastSystemBlock = system[system.length - 1];
    expect(lastSystemBlock.type).toBe('text');
    expect(lastSystemBlock.cache_control).toEqual({ type: 'ephemeral' });

    // tools array's LAST entry has cache_control; earlier entries don't.
    const tools = call.tools as
      | Array<{ name: string; cache_control?: { type: string } }>
      | undefined;
    expect(tools).toBeDefined();
    if (!tools) throw new Error('tools missing');
    expect(tools.length).toBeGreaterThan(1);
    const lastTool = tools[tools.length - 1];
    expect(lastTool.cache_control).toEqual({ type: 'ephemeral' });
    // Earlier tools must NOT carry cache_control — only one breakpoint
    // is meaningful at the tail per Anthropic's cumulative semantics.
    expect(tools[0].cache_control).toBeUndefined();
  });
});

// T16 truncation is NOT covered here because the route emits the
// `{ truncated: true, reason: 'max_tokens' }` event only on the
// streaming fallback path (when iterations cap at MAX_TOOL_ITERATIONS).
// Driving the create() loop to that cap requires returning tool_use
// blocks 15 times in a row, each of which then attempts tool execution
// against the real registry. That's brittle for a regression test —
// the truncation banner's actual rendering is verified by visual
// inspection during the demo and by the Sprint 18 code path that's
// been stable for ~6 sprints. If a regression slips in, it'll surface
// during the demo's "ask for every clause in detail" prompt.
