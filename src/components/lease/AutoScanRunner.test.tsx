// Sprint 26c.10/.11 — tests for AutoScanRunner.
//
// AutoScanRunner is the silent auto-scan agent. When mounted with
// `enabled=true` AND there's an active lease that hasn't been scanned
// yet (no extract_clauses tool event for it in ChatStreamContext),
// it fires a POST to /api/chat with the canonical STANDARD_SCAN_PROMPT
// and routes the NDJSON tool_result events into pushToolEvent so the
// right pane (RedFlagReport, ClausesList) populates automatically.

import { cleanup, render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ActiveLeaseRef,
  ChatStreamProvider,
  type ToolEvent,
  useChatStream,
} from '@/components/chat/ChatStreamContext';
import { STANDARD_SCAN_PROMPT } from '@/lib/chat/follow-up-prompts';
import { __resetAutoScanFiredLeases, AutoScanRunner } from './AutoScanRunner';

const ACTIVE_LEASE: ActiveLeaseRef = {
  lease_id: 'auto-scan-lease',
  filename: 'auto-scan.pdf',
  page_count: 3,
  clause_count: 5,
  pdfUrl: 'blob:auto-scan-mock',
};

// Build a single-frame NDJSON ReadableStream that emits a conversationId
// envelope, then a tool_use, then a tool_result for extract_clauses.
function mockStreamBody(leaseId: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const payload = [
        JSON.stringify({ conversationId: 'auto-scan-conv' }),
        JSON.stringify({
          tool_use: {
            id: 'tool_use_1',
            name: 'extract_clauses',
            input: { lease_id: leaseId },
          },
        }),
        JSON.stringify({
          tool_result: {
            id: 'tool_use_1',
            name: 'extract_clauses',
            result: {
              lease_id: leaseId,
              page_count: 3,
              clauses: [
                {
                  clause_id: 'c1',
                  clause_index: 0,
                  clause_type: 'security_deposit',
                  text: '...',
                  page_number: 1,
                },
              ],
            },
            audit_id: undefined,
          },
        }),
      ].join('\n');
      controller.enqueue(new TextEncoder().encode(`${payload}\n`));
      controller.close();
    },
  });
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetAutoScanFiredLeases();
  fetchSpy = vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: mockStreamBody(ACTIVE_LEASE.lease_id),
    } as unknown as Response),
  );
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderRunner({
  enabled,
  initialEvents = [],
  activeLease = ACTIVE_LEASE,
}: {
  enabled: boolean;
  initialEvents?: ToolEvent[];
  activeLease?: ActiveLeaseRef | null;
}): void {
  render(
    <ChatStreamProvider
      viewerRole="Tenant"
      initialEvents={initialEvents}
      activeLease={activeLease}
    >
      <AutoScanRunner enabled={enabled} conversationId={null} />
    </ChatStreamProvider>,
  );
}

describe('AutoScanRunner', () => {
  it('fires the standard scan once when enabled and the active lease has no extract event yet', async () => {
    renderRunner({ enabled: true });
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toMatch(/\/api\/chat$/);
    const body = JSON.parse(String(init.body)) as {
      message?: string;
      conversationId?: string | null;
    };
    expect(body.message).toBe(STANDARD_SCAN_PROMPT);
  });

  it('does NOT fire when enabled=false', async () => {
    renderRunner({ enabled: false });
    // Give the effect a chance to run.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does NOT fire when the active lease already has an extract_clauses event (already scanned)', async () => {
    const priorExtract: ToolEvent = {
      tool_name: 'extract_clauses',
      input: {},
      result: {
        lease_id: ACTIVE_LEASE.lease_id,
        page_count: 3,
        clauses: [
          {
            clause_id: 'prior-c1',
            clause_index: 0,
            clause_type: 'security_deposit',
            page_number: 1,
          },
        ],
      },
      audit_id: undefined,
    };
    renderRunner({ enabled: true, initialEvents: [priorExtract] });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does NOT fire when activeLease is null', async () => {
    renderRunner({ enabled: true, activeLease: null });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('only fires once even if the component re-renders', async () => {
    const { rerender } = render(
      <ChatStreamProvider
        viewerRole="Tenant"
        initialEvents={[]}
        activeLease={ACTIVE_LEASE}
      >
        <AutoScanRunner enabled={true} conversationId={null} />
      </ChatStreamProvider>,
    );
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
    // Re-render with the same lease — should not re-fire.
    rerender(
      <ChatStreamProvider
        viewerRole="Tenant"
        initialEvents={[]}
        activeLease={ACTIVE_LEASE}
      >
        <AutoScanRunner enabled={true} conversationId={null} />
      </ChatStreamProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('renders nothing in the DOM', () => {
    const { container } = render(
      <ChatStreamProvider
        viewerRole="Tenant"
        initialEvents={[]}
        activeLease={ACTIVE_LEASE}
      >
        <AutoScanRunner enabled={false} conversationId={null} />
      </ChatStreamProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  // Sprint 26c.11 — regression for the dev-mode strict-mode bug. The
  // earlier implementation used `useRef` + AbortController cleanup,
  // which killed every in-flight stream in `next dev` because React
  // mount-cleanup-remount cycles aborted the fetch before the reader
  // could pull any tool_result events. Wrapping the runner in
  // `<StrictMode>` simulates that cycle.
  it('completes its stream even when mounted inside <StrictMode> (does not abort on cleanup)', async () => {
    // We need a probe that captures pushToolEvent calls. Mount inside
    // the same provider so the runner shares the same context the
    // probe reads.
    const observed: ToolEvent[] = [];
    function Probe(): null {
      const { toolEvents } = useChatStream();
      // Mirror the current snapshot every render.
      observed.length = 0;
      observed.push(...toolEvents);
      return null;
    }

    render(
      <StrictMode>
        <ChatStreamProvider
          viewerRole="Tenant"
          initialEvents={[]}
          activeLease={ACTIVE_LEASE}
        >
          <Probe />
          <AutoScanRunner enabled={true} conversationId={null} />
        </ChatStreamProvider>
      </StrictMode>,
    );

    // The fetch must complete and push the extract_clauses tool_result
    // into context, even though StrictMode triggered a mount-cleanup-
    // remount on the AutoScanRunner.
    await waitFor(
      () => {
        expect(observed.some((e) => e.tool_name === 'extract_clauses')).toBe(
          true,
        );
      },
      { timeout: 1000 },
    );

    // And the module-level guard prevented a second fire even though
    // StrictMode re-ran the effect.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  // Sprint 28.5 — Bug 2 follow-up: preserve tool_use input on pushed events.
  // The earlier implementation pushed `input: {}` on every tool_event,
  // which left useScanProgress unable to count grading attempts (it
  // reads input.clause_id). The header parked on a spinner forever
  // because attempted stayed 0 even after the scan finished. The fix
  // tracks tool_use envelopes by id and threads their input into the
  // matching tool_result.
  it('preserves tool_use input on pushed tool events (Bug 2 follow-up)', async () => {
    const observed: ToolEvent[] = [];
    function Probe(): null {
      const { toolEvents } = useChatStream();
      observed.length = 0;
      observed.push(...toolEvents);
      return null;
    }
    // Use a richer mock body that includes a grade_clause_severity
    // pair so we can assert input.clause_id flows through.
    const richBody = (): ReadableStream<Uint8Array> =>
      new ReadableStream({
        start(controller) {
          const payload = [
            JSON.stringify({ conversationId: 'auto-scan-conv' }),
            JSON.stringify({
              tool_use: {
                id: 'tu_extract',
                name: 'extract_clauses',
                input: { lease_id: ACTIVE_LEASE.lease_id },
              },
            }),
            JSON.stringify({
              tool_result: {
                id: 'tu_extract',
                name: 'extract_clauses',
                result: {
                  lease_id: ACTIVE_LEASE.lease_id,
                  page_count: 3,
                  clauses: [{ clause_id: 'c1', clause_index: 0 }],
                },
                audit_id: undefined,
              },
            }),
            JSON.stringify({
              tool_use: {
                id: 'tu_grade',
                name: 'grade_clause_severity',
                input: { clause_id: 'c1' },
              },
            }),
            JSON.stringify({
              tool_result: {
                id: 'tu_grade',
                name: 'grade_clause_severity',
                result: { clause_id: 'c1', severity: 'med' },
                audit_id: undefined,
              },
            }),
          ].join('\n');
          controller.enqueue(new TextEncoder().encode(`${payload}\n`));
          controller.close();
        },
      });
    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        body: richBody(),
      } as unknown as Response),
    );

    render(
      <ChatStreamProvider
        viewerRole="Tenant"
        initialEvents={[]}
        activeLease={ACTIVE_LEASE}
      >
        <Probe />
        <AutoScanRunner enabled={true} conversationId={null} />
      </ChatStreamProvider>,
    );

    await waitFor(() => {
      expect(observed).toHaveLength(2);
    });
    const grade = observed.find((e) => e.tool_name === 'grade_clause_severity');
    expect(grade).toBeDefined();
    // The critical assertion: the input.clause_id from the tool_use
    // envelope is threaded onto the pushed tool event so useScanProgress
    // can count this clause as attempted.
    expect((grade?.input as { clause_id?: unknown })?.clause_id).toBe('c1');
  });

  // Sprint 26c.11 — verify conversationId capture + handoff.
  it('captures the conversationId envelope and writes it to ChatStreamContext.autoScanConversationId', async () => {
    let observedConversationId: string | null = null;
    function Probe(): null {
      const { autoScanConversationId } = useChatStream();
      observedConversationId = autoScanConversationId;
      return null;
    }

    render(
      <ChatStreamProvider
        viewerRole="Tenant"
        initialEvents={[]}
        activeLease={ACTIVE_LEASE}
      >
        <Probe />
        <AutoScanRunner enabled={true} conversationId={null} />
      </ChatStreamProvider>,
    );

    await waitFor(() => {
      expect(observedConversationId).toBe('auto-scan-conv');
    });
  });
});
