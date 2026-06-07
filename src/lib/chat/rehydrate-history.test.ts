import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/lib/log/logger';

afterEach(() => {
  vi.restoreAllMocks();
});

import {
  rehydrateConversationMessages,
  rehydrateToolEvents,
} from './rehydrate-history';

describe('rehydrateConversationMessages', () => {
  it('folds persisted tool rows into assistant toolInvocations', () => {
    const messages = rehydrateConversationMessages([
      { id: 'm1', role: 'user', content: 'Create a content plan' },
      {
        id: 'm2',
        role: 'assistant',
        content: JSON.stringify({
          tool_use: {
            id: 'tool-1',
            name: 'search_corpus',
            input: { query: 'brand voice' },
          },
        }),
      },
      {
        id: 'm3',
        role: 'tool',
        content: JSON.stringify({
          tool_result: {
            id: 'tool-1',
            result: { result_count: 3 },
          },
        }),
      },
      {
        id: 'm4',
        role: 'assistant',
        content:
          'Draft the first week around the platform vision and developer advocacy.',
      },
    ]);

    expect(messages).toEqual([
      { id: 'm1', role: 'user', content: 'Create a content plan' },
      {
        id: expect.any(String),
        role: 'assistant',
        content:
          'Draft the first week around the platform vision and developer advocacy.',
        toolInvocations: [
          {
            id: 'tool-1',
            name: 'search_corpus',
            input: { query: 'brand voice' },
            result: { result_count: 3 },
          },
        ],
      },
    ]);
  });
});

describe('rehydrateToolEvents', () => {
  it('pairs each tool_use with its matching tool_result by id', () => {
    const events = rehydrateToolEvents([
      { id: 'm1', role: 'user', content: 'scan' },
      {
        id: 'm2',
        role: 'assistant',
        content: JSON.stringify({
          tool_use: {
            id: 'tu-1',
            name: 'grade_clause_severity',
            input: { clause_id: 'c1' },
          },
        }),
      },
      {
        id: 'm3',
        role: 'tool',
        content: JSON.stringify({
          tool_result: {
            id: 'tu-1',
            result: { clause_id: 'c1', severity: 'high' },
            audit_id: 'a-1',
          },
        }),
      },
    ]);

    expect(events).toEqual([
      {
        tool_name: 'grade_clause_severity',
        input: { clause_id: 'c1' },
        result: { clause_id: 'c1', severity: 'high' },
        audit_id: 'a-1',
      },
    ]);
  });

  it('skips orphan tool_use rows that have no matching tool_result', () => {
    const events = rehydrateToolEvents([
      {
        id: 'm1',
        role: 'assistant',
        content: JSON.stringify({
          tool_use: {
            id: 'orphan',
            name: 'extract_clauses',
            input: { lease_id: 'L' },
          },
        }),
      },
    ]);

    expect(events).toEqual([]);
  });

  // Sprint 25.1 (R14) — orphan tool_result (no matching tool_use) should
  // be skipped AND surface a warning so DB corruption / migration bugs
  // don't render an incomplete red-flag report silently. (Sprint 44 sweep:
  // the warning now goes through the structured logger, not console.)
  it('warns and skips orphan tool_result rows with no matching tool_use', () => {
    const warn = vi
      .spyOn(logger, 'warn')
      .mockImplementation((() => {}) as never);

    const events = rehydrateToolEvents([
      {
        id: 'm1',
        role: 'tool',
        content: JSON.stringify({
          tool_result: {
            id: 'never-used',
            name: 'grade_clause_severity',
            result: { severity: 'high' },
          },
        }),
      },
    ]);

    expect(events).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        toolResultId: 'never-used',
        toolName: 'grade_clause_severity',
      }),
      'rehydrate.orphan_tool_result',
    );
  });

  it('preserves insertion order across multiple tool pairs', () => {
    const events = rehydrateToolEvents([
      {
        id: 'm1',
        role: 'assistant',
        content: JSON.stringify({
          tool_use: {
            id: 't1',
            name: 'extract_clauses',
            input: { lease_id: 'L' },
          },
        }),
      },
      {
        id: 'm2',
        role: 'tool',
        content: JSON.stringify({
          tool_result: { id: 't1', result: { clauses: [{ id: 'c1' }] } },
        }),
      },
      {
        id: 'm3',
        role: 'assistant',
        content: JSON.stringify({
          tool_use: {
            id: 't2',
            name: 'grade_clause_severity',
            input: { clause_id: 'c1' },
          },
        }),
      },
      {
        id: 'm4',
        role: 'tool',
        content: JSON.stringify({
          tool_result: {
            id: 't2',
            result: { clause_id: 'c1', severity: 'medium' },
          },
        }),
      },
    ]);

    expect(events.map((e) => e.tool_name)).toEqual([
      'extract_clauses',
      'grade_clause_severity',
    ]);
    expect(events[1].input).toEqual({ clause_id: 'c1' });
  });

  it('ignores user-role rows and non-JSON content', () => {
    const events = rehydrateToolEvents([
      { id: 'm1', role: 'user', content: 'hello' },
      { id: 'm2', role: 'assistant', content: 'plain text reply' },
    ]);
    expect(events).toEqual([]);
  });

  it('prefers the tool_result.name when present over the cached tool_use name', () => {
    const events = rehydrateToolEvents([
      {
        id: 'm1',
        role: 'assistant',
        content: JSON.stringify({
          tool_use: { id: 't1', name: 'cached_name', input: {} },
        }),
      },
      {
        id: 'm2',
        role: 'tool',
        content: JSON.stringify({
          tool_result: { id: 't1', name: 'authoritative_name', result: {} },
        }),
      },
    ]);
    expect(events[0].tool_name).toBe('authoritative_name');
  });
});
