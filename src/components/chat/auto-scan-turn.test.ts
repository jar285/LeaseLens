// Sprint 33.A.2 — pure helper that marks the auto-scan's first
// scan-bearing assistant turn so ChatMessage can suppress the redundant
// in-chat ScanTimeline (the right-pane staircase is canonical). Tested
// in isolation so we don't have to mount the streaming ChatUI.

import { describe, expect, it } from 'vitest';
import { markAutoScanTurn } from './auto-scan-turn';
import type { ChatMessageProps } from './ChatMessage';

const scanInvocations = [
  { id: 't-extract', name: 'extract_clauses', input: {} },
  {
    id: 't-grade-1',
    name: 'grade_clause_severity',
    input: { clause_id: 'c1' },
  },
];

const baseConversation: ChatMessageProps[] = [
  { id: 'u-1', role: 'user', content: 'Run a standard scan.' },
  {
    id: 'a-1',
    role: 'assistant',
    content: 'Done — see the findings on the right.',
    toolInvocations: scanInvocations,
  },
];

describe('markAutoScanTurn', () => {
  it('marks the first scan-bearing assistant message (the auto-scan turn)', () => {
    const out = markAutoScanTurn(baseConversation);
    const assistant = out.find((m) => m.id === 'a-1');
    expect(assistant?.isAutoScanTurn).toBe(true);
    // The user message is never marked.
    expect(out.find((m) => m.id === 'u-1')?.isAutoScanTurn).toBeUndefined();
  });

  it('marks ONLY the first scan-bearing assistant turn — a later "scan again" turn stays unmarked', () => {
    const withRescan: ChatMessageProps[] = [
      ...baseConversation,
      { id: 'u-2', role: 'user', content: 'scan again' },
      {
        id: 'a-2',
        role: 'assistant',
        content: 'Re-running the scan.',
        toolInvocations: scanInvocations,
      },
    ];
    const out = markAutoScanTurn(withRescan);
    expect(out.find((m) => m.id === 'a-1')?.isAutoScanTurn).toBe(true);
    // The user-initiated re-scan is NOT the auto-scan turn; it keeps its
    // ScanTimeline.
    expect(out.find((m) => m.id === 'a-2')?.isAutoScanTurn).toBeUndefined();
  });

  it('returns the messages unchanged when there is no scan-bearing assistant message', () => {
    const noScan: ChatMessageProps[] = [
      { id: 'u-1', role: 'user', content: 'hi' },
      { id: 'a-1', role: 'assistant', content: 'hello' },
    ];
    const out = markAutoScanTurn(noScan);
    expect(out).toBe(noScan);
  });

  it('does not mark a scan-bearing USER message (only assistant turns)', () => {
    // Defensive: the STANDARD_SCAN_PROMPT user message never carries
    // tool invocations, but pin that a user role is never the turn.
    const userScan: ChatMessageProps[] = [
      {
        id: 'u-1',
        role: 'user',
        content: 'scan',
        toolInvocations: scanInvocations,
      },
      {
        id: 'a-1',
        role: 'assistant',
        content: 'Done.',
        toolInvocations: scanInvocations,
      },
    ];
    const out = markAutoScanTurn(userScan);
    expect(out.find((m) => m.id === 'u-1')?.isAutoScanTurn).toBeUndefined();
    expect(out.find((m) => m.id === 'a-1')?.isAutoScanTurn).toBe(true);
  });

  it('does not mutate the input array', () => {
    const snapshot = JSON.parse(JSON.stringify(baseConversation));
    markAutoScanTurn(baseConversation);
    expect(baseConversation).toEqual(snapshot);
  });
});
