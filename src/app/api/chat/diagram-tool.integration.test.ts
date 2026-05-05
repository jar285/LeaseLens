// Sprint 12 — integration test for the render_workflow_diagram tool.
// Confirms tool_use + tool_result NDJSON events flow end-to-end through
// the chat route, no audit row is written, and the diagram tool is
// resolved by the registry.

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
        return false;
      },
    },
  };
});

// Track create() call order so the first call returns tool_use and
// the second returns the final text response.
const createMock = vi.fn();

vi.mock('@/lib/anthropic/client', () => ({
  getAnthropicClient: vi.fn().mockReturnValue({
    messages: {
      create: (...args: unknown[]) => createMock(...args),
      // The diagram-tool flow is exercised through tool-use iterations
      // (messages.create), not the streaming finalizer. Stub stream too
      // for safety in case MAX_TOOL_ITERATIONS is hit.
      stream: vi.fn().mockReturnValue({
        on: vi.fn().mockImplementation(function (this: unknown) {
          return this;
        }),
        finalMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Diagram rendered.' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      }),
    },
  }),
}));

const TEST_USER_ID = '00000000-0000-0000-0000-000000000010';
const BASE_URL = 'http://localhost:3000';

async function makeSessionRequest(message: string) {
  const token = await encrypt({
    userId: TEST_USER_ID,
    role: 'Creator' as Role,
    displayName: 'Test Creator',
  });
  const req = new NextRequest(new URL('/api/chat', BASE_URL), {
    method: 'POST',
    body: JSON.stringify({ message, conversationId: null }),
  });
  req.cookies.set('contentops_session', token);
  const workspaceToken = await encodeWorkspace({
    workspace_id: SAMPLE_WORKSPACE.id,
    created_workspace_ids: [],
  });
  req.cookies.set(WORKSPACE_COOKIE_NAME, workspaceToken);
  return req;
}

interface NdjsonEvent {
  conversationId?: string;
  chunk?: string;
  tool_use?: { id: string; name: string; input: Record<string, unknown> };
  tool_result?: {
    id: string;
    name: string;
    result: unknown;
    error?: string;
    audit_id?: string;
    compensating_available?: boolean;
  };
  error?: string;
}

async function drainNdjson(res: Response): Promise<NdjsonEvent[]> {
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const events: NdjsonEvent[] = [];
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      events.push(JSON.parse(line) as NdjsonEvent);
    }
  }
  if (buffer.trim()) events.push(JSON.parse(buffer) as NdjsonEvent);
  return events;
}

describe('Chat API — render_workflow_diagram tool flow (Sprint 12)', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM messages').run();
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM rate_limit').run();
    db.prepare('DELETE FROM spend_log').run();

    db.prepare(
      'INSERT INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(TEST_USER_ID, 'diag@example.com', 'Creator', 'Diag', 0);

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

    createMock.mockReset();
    // First create() — model emits a tool_use for render_workflow_diagram.
    createMock.mockResolvedValueOnce({
      content: [
        {
          type: 'tool_use',
          id: 'toolu_diag_1',
          name: 'render_workflow_diagram',
          input: {
            code: 'flowchart TD\nA-->B',
            title: 'Test diagram',
          },
        },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    // Second create() — model emits final text after seeing the tool result.
    createMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Here is the diagram you asked for.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 12, output_tokens: 8 },
    });
  });

  afterEach(() => {
    db.prepare('DELETE FROM audit_log').run();
  });

  it('emits tool_use + tool_result NDJSON events with the validated diagram envelope', async () => {
    const req = await makeSessionRequest('Draw the approval pipeline.');
    const res = await POST(req);
    expect(res.status).toBe(200);

    const events = await drainNdjson(res);
    const errorEvent = events.find((e) => e.error);
    expect(errorEvent, errorEvent?.error).toBeUndefined();

    // The route mints its own UUID for the tool invocation id. Match
    // by name, then find the matching tool_result by the same id.
    const toolUse = events.find(
      (e) => e.tool_use && e.tool_use.name === 'render_workflow_diagram',
    );
    expect(toolUse).toBeDefined();
    expect(toolUse?.tool_use?.input.code).toBe('flowchart TD\nA-->B');

    const toolUseId = toolUse?.tool_use?.id;
    const toolResult = events.find(
      (e) => e.tool_result && e.tool_result.id === toolUseId,
    );
    expect(toolResult).toBeDefined();
    expect(toolResult?.tool_result?.error).toBeUndefined();
    const result = toolResult?.tool_result?.result as {
      code: string;
      diagram_type: string;
      title?: string;
    };
    expect(result.code).toBe('flowchart TD\nA-->B');
    expect(result.diagram_type).toBe('flowchart');
    expect(result.title).toBe('Test diagram');
  });

  it('does not write an audit_log row for read-only diagram tool calls', async () => {
    const beforeRow = db
      .prepare('SELECT COUNT(*) as n FROM audit_log')
      .get() as { n: number };

    const req = await makeSessionRequest('Draw the approval pipeline.');
    const res = await POST(req);
    await drainNdjson(res);

    const afterRow = db
      .prepare('SELECT COUNT(*) as n FROM audit_log')
      .get() as { n: number };
    expect(afterRow.n).toBe(beforeRow.n);
  });

  it('persists user message, tool_use envelope, tool_result row, and final assistant text', async () => {
    const req = await makeSessionRequest('Draw the approval pipeline.');
    const res = await POST(req);
    await drainNdjson(res);

    const messages = db
      .prepare('SELECT role, content FROM messages ORDER BY created_at ASC')
      .all() as { role: string; content: string }[];

    const userMsgs = messages.filter((m) => m.role === 'user');
    expect(userMsgs).toHaveLength(1);
    expect(userMsgs[0].content).toBe('Draw the approval pipeline.');

    // The chat route persists each tool round-trip as an assistant
    // (tool_use envelope JSON) row + a 'tool' role row + the final
    // assistant text. Final text is the last assistant row.
    const finalAssistant = messages
      .filter((m) => m.role === 'assistant')
      .at(-1);
    expect(finalAssistant?.content).toContain(
      'Here is the diagram you asked for.',
    );

    // Tool result was persisted as a 'tool' role row.
    const toolRows = messages.filter((m) => m.role === 'tool');
    expect(toolRows).toHaveLength(1);
    const toolPayload = JSON.parse(toolRows[0].content);
    expect(toolPayload.tool_result.result.diagram_type).toBe('flowchart');
  });
});
