// Sprint 44B.2 — a failing tool's error must NOT leak its raw message (which
// embeds the draft-email body / clause text on a JSON.parse failure) to the
// client NDJSON stream, the persisted `messages` row, or the LLM context. Only
// the safe { name, code } from toSafeToolError may cross the boundary.
//
// We mock @/lib/db to a fresh in-memory DB (FK off → no conversation seeding)
// and drive executeToolAndPersist directly with a tool that throws a PII-bearing
// SyntaxError and a capturing stream controller.

import type { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', async () => {
  const { createTestDb } = await import('@/lib/test/db');
  const db = createTestDb();
  // This test exercises redaction, not referential integrity — drop FK
  // enforcement so we can persist a `messages` row without seeding the
  // conversation/workspace/user chain.
  db.pragma('foreign_keys = OFF');
  return { db };
});

import { db } from '@/lib/db';
import type { ToolDescriptor } from '@/lib/tools/domain';
import { ToolRegistry } from '@/lib/tools/registry';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { executeToolAndPersist } from './route';

const PII = 'DRAFT-BODY-PII-xyz tenant Jane Doe $2200';
const CONV = 'conv-44b2';

afterEach(() => {
  db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(CONV);
  db.prepare('DELETE FROM tool_calls WHERE conversation_id = ?').run(CONV);
});

function registryWithFailingTool(): ToolRegistry {
  const reg = new ToolRegistry(db);
  const tool: ToolDescriptor = {
    name: 'failing_tool',
    description:
      'throws a PII-bearing SyntaxError (mirrors a JSON.parse failure)',
    inputSchema: { type: 'object', properties: {} },
    roles: 'ALL',
    category: 'system',
    execute: async () => {
      throw new SyntaxError(`Unexpected token in JSON: ${PII}`);
    },
  };
  reg.register(tool);
  return reg;
}

describe('chat route — tool-failure error redaction (Sprint 44B.2)', () => {
  it('streams + persists only a safe { name, code }, never the raw PII message', async () => {
    const chunks: string[] = [];
    const decoder = new TextDecoder();
    const controller = {
      enqueue: (c: Uint8Array) => {
        chunks.push(decoder.decode(c));
      },
    } as unknown as ReadableStreamDefaultController;

    // Cast a minimal block — executeToolAndPersist only reads id/name/input;
    // the SDK's ToolUseBlock carries extra fields irrelevant here.
    const toolUse = {
      type: 'tool_use',
      id: 'toolu_x',
      name: 'failing_tool',
      input: {},
    } as unknown as ToolUseBlock;

    await executeToolAndPersist(
      toolUse,
      CONV,
      'user-1',
      'Tenant',
      SAMPLE_WORKSPACE.id,
      registryWithFailingTool(),
      controller,
      new TextEncoder(),
    );

    // 1. Nothing PII-bearing was streamed to the client.
    const streamed = chunks.join('');
    expect(streamed).not.toContain('DRAFT-BODY-PII-xyz');
    expect(streamed).not.toContain('Jane Doe');

    // 2. The streamed tool_result carries the safe structured shape.
    const event = JSON.parse(
      chunks.find((c) => c.includes('tool_result')) ?? '{}',
    );
    expect(event.tool_result.error).toBe('SyntaxError');
    expect(event.tool_result.result).toEqual({
      error: 'SyntaxError',
      code: 'parse_error',
    });

    // 3. The persisted `messages` tool row (re-fed to the LLM) has no PII.
    const toolRow = db
      .prepare(
        "SELECT content FROM messages WHERE conversation_id = ? AND role = 'tool'",
      )
      .get(CONV) as { content: string } | undefined;
    expect(toolRow?.content ?? '').not.toContain('DRAFT-BODY-PII-xyz');
    expect(toolRow?.content ?? '').not.toContain('Jane Doe');
  });
});
