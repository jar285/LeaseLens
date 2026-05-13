// S19.3 — React adapter test for `useScanNarrative`.
//
// The hook is intentionally a 5-line wrapper over `computeScanNarrative`:
// it reads `toolEvents` + `activeLease` from ChatStreamContext, memoises
// the call, and returns the result. The full behaviour is tested in
// scan-narrative.test.ts; this file just pins that the hook
//   * reads from context (i.e. honours the provider) and
//   * delegates to the pure function with the right inputs.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ChatStreamProvider,
  type ToolEvent,
} from '@/components/chat/ChatStreamContext';
import { computeScanNarrative, type NarrativeLease } from './scan-narrative';
import { useScanNarrative } from './use-scan-narrative';

const LEASE: NarrativeLease = {
  lease_id: 'lease-hook-abc',
  filename: 'apartment.pdf',
};

function Probe(): React.JSX.Element {
  const out = useScanNarrative();
  return (
    <div>
      <span data-testid="intro-id">{out.intro?.id ?? '(none)'}</span>
      <span data-testid="summary-id">{out.summary?.id ?? '(none)'}</span>
    </div>
  );
}

describe('useScanNarrative', () => {
  afterEach(cleanup);

  it('returns null/null when no activeLease is set', () => {
    render(
      <ChatStreamProvider>
        <Probe />
      </ChatStreamProvider>,
    );
    expect(screen.getByTestId('intro-id').textContent).toBe('(none)');
    expect(screen.getByTestId('summary-id').textContent).toBe('(none)');
  });

  it('returns the intro id when activeLease is set and no events have fired', () => {
    render(
      <ChatStreamProvider activeLease={LEASE}>
        <Probe />
      </ChatStreamProvider>,
    );
    const expected = computeScanNarrative({ events: [], lease: LEASE }).intro
      ?.id;
    expect(screen.getByTestId('intro-id').textContent).toBe(expected);
    expect(screen.getByTestId('summary-id').textContent).toBe('(none)');
  });

  it('delegates to computeScanNarrative for complete scans', () => {
    const events: ToolEvent[] = [
      {
        tool_name: 'extract_clauses',
        input: { lease_id: LEASE.lease_id },
        result: {
          clauses: [
            {
              clause_id: 'c1',
              clause_type: 'security_deposit',
              clause_index: 0,
              page_number: 1,
            },
          ],
        },
        audit_id: 'extract-1',
      },
      {
        tool_name: 'grade_clause_severity',
        input: { clause_id: 'c1' },
        result: {
          clause_id: 'c1',
          severity: 'high',
          statute_citation: 'NJSA 46:8-1',
          chunk_id: 'k',
          reasoning: 'r',
          recommended_action: 'a',
          clause_type: 'security_deposit',
        },
        audit_id: undefined,
      },
    ];

    render(
      <ChatStreamProvider activeLease={LEASE} initialEvents={events}>
        <Probe />
      </ChatStreamProvider>,
    );
    const expected = computeScanNarrative({ events, lease: LEASE }).summary?.id;
    expect(screen.getByTestId('summary-id').textContent).toBe(expected);
  });
});
