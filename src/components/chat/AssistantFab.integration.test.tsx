// Sprint 26c Phase 6 — integration test.
//
// Drives the full FAB → ChatUI → ChatComposer flow with the real
// AssistantFabContext + AssistantFabClient. Stubs ChatUI's fetch so
// the NDJSON stream resolves deterministically without hitting the
// network; verifies that openWith pre-fills the composer and that
// submitting the seeded prompt forwards the right body to /api/chat.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaseParserProvider } from '@/components/lease/LeaseParserContext';

// Sprint 29.8 — the new undo-toast animation uses AnimatePresence +
// motion.div with a SPRING_SNAPPY enter/exit. In jsdom AnimatePresence
// stalls exit transitions because the animation engine has no real
// timing; mocking useReducedMotion to return `true` selects the plain
// reduced-motion branch instead, so the toast tests stay synchronous
// + deterministic. Real browsers + Playwright see the animated path.
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useReducedMotion: () => true };
});

// Sprint 29.11 — controllable lifecycle for "scan complete" banner tests.
// useScanLifecycle has a 650ms internal timer for preparing → review_ready
// AND requires real tool events to advance through stages. Mocking the
// hook lets us simulate lifecycle transitions deterministically. Default
// to 'idle' (no lease, no scan); individual tests change the return to
// drive transitions.
//
// Pattern matches AssistantFab.client.test.tsx (no spread of original
// module) — spreading the real module's exports was causing the actual
// useScanLifecycle to win over the override in some test orderings.
const lifecycleMock = vi.fn();
vi.mock('@/components/lease/scan-lifecycle', () => ({
  useScanLifecycle: () => lifecycleMock(),
}));
const IDLE_LIFECYCLE = {
  stage: 'idle' as const,
  index: -1,
  label: '',
  detail: null,
  progress: { phase: 'idle' as const, total: 0, attempted: 0, label: '' },
};
const MID_SCAN_LIFECYCLE = {
  stage: 'checking_clauses' as const,
  index: 3,
  label: 'Checking clauses against NJ tenant-law rules',
  detail: 'Grading 5 of 15',
  progress: { phase: 'grading' as const, total: 15, attempted: 5, label: '' },
};
const PREPARING_LIFECYCLE = {
  stage: 'preparing_red_flags' as const,
  index: 4,
  label: 'Preparing red flags',
  detail: null,
  progress: {
    phase: 'complete' as const,
    total: 15,
    attempted: 15,
    label: '',
  },
};
const REVIEW_READY_LIFECYCLE = {
  stage: 'review_ready' as const,
  index: 5,
  label: 'Review ready',
  detail: '15 clauses',
  progress: {
    phase: 'complete' as const,
    total: 15,
    attempted: 15,
    label: '',
  },
};

import { AssistantFabClient } from './AssistantFab.client';
import { AssistantFabProvider, useAssistantFab } from './AssistantFabContext';
import { ChatStreamProvider } from './ChatStreamContext';

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Stub the NDJSON streamer with a single tail-chunk so ChatUI's
  // stream reader resolves immediately. We don't assert on the
  // assistant reply itself — only that the request body carried the
  // seeded prompt as the user message.
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          JSON.stringify({
            conversationId: 'conv-int',
          }) + '\n',
        ),
      );
      controller.close();
    },
  });
  fetchSpy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body,
  } as unknown as Response);
  vi.stubGlobal('fetch', fetchSpy);
  // Sprint 29.11 — default lifecycle to idle each test; individual
  // tests override to drive scan-complete transitions.
  lifecycleMock.mockReturnValue(IDLE_LIFECYCLE);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AssistantFab integration', () => {
  // Sprint 28.8 (+ 29.1 rename) — fixes the orphan-FAB-state corner of
  // Bug 3. After Sprint 3 the lease is preserved across the chat-clear
  // action; Sprint 28.8 clears the FAB's pendingPrompt + selection too
  // so the next user question isn't biased toward the prior clause
  // context. Sprint 29.1 renamed the button from "New conversation" to
  // "Clear assistant chat" (Don Norman: the destructive-sounding label
  // confused users into thinking it wiped the lease review). The aria-
  // live announcement copy moved to "Assistant chat cleared. Your
  // lease review was preserved." to match the new label.
  it('Sprint 29.1 — clicking "Clear assistant chat" clears FAB pendingPrompt + selection AND fires an aria-live announcement', async () => {
    const holder: { fab: ReturnType<typeof useAssistantFab> | null } = {
      fab: null,
    };
    function Probe(): null {
      holder.fab = useAssistantFab();
      return null;
    }

    render(
      <AssistantFabProvider>
        <LeaseParserProvider>
          <ChatStreamProvider viewerRole="Tenant">
            <Probe />
            <AssistantFabClient
              workspaceName="Demo workspace"
              conversationId="conv-existing"
              initialMessages={[
                { id: 'msg-1', role: 'user', content: 'Hi there' },
              ]}
            />
          </ChatStreamProvider>
        </LeaseParserProvider>
      </AssistantFabProvider>,
    );

    // Open the drawer with a prefilled prompt + clause selection,
    // mirroring what RedFlagReport's Explain button does in
    // production.
    act(() => {
      holder.fab?.openWith({
        initialPrompt: 'Explain the security deposit clause.',
        clauseId: 'c-deposit',
        severity: 'high',
        statuteCitation: 'NJ Stat 46:8-19',
      });
    });

    // Wait for the drawer + composer to mount.
    await screen.findByTestId('assistant-fab-drawer');
    expect(holder.fab?.pendingPrompt).toBe(
      'Explain the security deposit clause.',
    );
    expect(holder.fab?.selection.clauseId).toBe('c-deposit');

    // Click the "Clear assistant chat" button rendered inside ChatUI.
    // Sprint 29.1 renamed the visible label; the testid is retained
    // so downstream tooling that grips by testid keeps working.
    const clearChatButton = screen.getByTestId('new-conversation-btn');
    expect(clearChatButton.textContent ?? '').toMatch(/clear assistant chat/i);
    // Sprint 29.1 — the button now carries a helper-text description
    // ("Your lease, clauses, and red flags will stay here.") wired via
    // aria-describedby so screen-reader users hear the reassurance
    // before they activate the action.
    const describedById = clearChatButton.getAttribute('aria-describedby');
    expect(describedById).toBeTruthy();
    const helper = document.getElementById(describedById ?? '');
    expect(helper).not.toBeNull();
    expect(helper?.textContent ?? '').toMatch(
      /lease.*clauses.*red flags.*stay here/i,
    );
    fireEvent.click(clearChatButton);

    // Drawer stays open — user expects to keep typing.
    expect(holder.fab?.state).toBe('drawer');
    // FAB-side context is gone — no leftover clause selection to
    // bias the next question.
    expect(holder.fab?.pendingPrompt).toBeNull();
    expect(holder.fab?.selection.clauseId).toBeNull();
    expect(holder.fab?.selection.severity).toBeUndefined();
    expect(holder.fab?.selection.statuteCitation).toBeUndefined();

    // The aria-live announcer carries the preservation message so a
    // screen-reader user knows their lease is intact (this would have
    // been the entire bug experience for SR users pre-Sprint-3).
    const announcer = await screen.findByTestId('new-conversation-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    // Sprint 29.1 — announcement copy refreshed to match the new
    // button label. Pattern stays in this file because the matcher
    // shape (aria-live + lease-preservation phrasing) is the
    // load-bearing contract; only the exact words moved.
    expect(announcer.textContent ?? '').toMatch(
      /chat cleared.*lease.*preserved/i,
    );
  });

  // Sprint 29.3 — Assistant context bar. The user can always tell what
  // lease (and optionally which clause) the assistant is using.
  describe('Sprint 29.3 — assistant context bar', () => {
    it('shows "No lease attached" when no activeLease', async () => {
      render(
        <AssistantFabProvider>
          <LeaseParserProvider>
            <ChatStreamProvider viewerRole="Tenant">
              <AssistantFabClient
                workspaceName="Demo workspace"
                conversationId={null}
                initialMessages={[]}
              />
            </ChatStreamProvider>
          </LeaseParserProvider>
        </AssistantFabProvider>,
      );

      fireEvent.click(screen.getByTestId('assistant-fab'));
      await screen.findByTestId('assistant-fab-drawer');

      const bar = await screen.findByTestId('assistant-context-bar');
      expect(bar.textContent ?? '').toMatch(/using:/i);
      expect(bar.textContent ?? '').toMatch(/no lease attached/i);
      // No focused-clause row when there's no selection.
      expect(
        screen.queryByTestId('assistant-context-bar-focus'),
      ).not.toBeInTheDocument();
    });

    it('shows lease filename + clause count + lifecycle label when a lease is mounted', async () => {
      render(
        <AssistantFabProvider>
          <LeaseParserProvider
            activeLease={{
              lease_id: 'l-1',
              filename: 'sample.pdf',
              page_count: 2,
              clause_count: 15,
              pdfUrl: 'blob:test',
            }}
          >
            <ChatStreamProvider viewerRole="Tenant">
              <AssistantFabClient
                workspaceName="Demo workspace"
                conversationId={null}
                initialMessages={[]}
              />
            </ChatStreamProvider>
          </LeaseParserProvider>
        </AssistantFabProvider>,
      );

      fireEvent.click(screen.getByTestId('assistant-fab'));
      await screen.findByTestId('assistant-fab-drawer');

      const bar = await screen.findByTestId('assistant-context-bar');
      expect(bar.textContent ?? '').toMatch(/sample\.pdf/i);
      expect(bar.textContent ?? '').toMatch(/15 clauses/i);
    });

    it('shows "Focused on:" row with a detach × button when fab.selection is set, and clicking × clears the row', async () => {
      const holder: { fab: ReturnType<typeof useAssistantFab> | null } = {
        fab: null,
      };
      function Probe(): null {
        holder.fab = useAssistantFab();
        return null;
      }

      render(
        <AssistantFabProvider>
          <LeaseParserProvider
            activeLease={{
              lease_id: 'l-1',
              filename: 'sample.pdf',
              page_count: 2,
              clause_count: 15,
              pdfUrl: 'blob:test',
            }}
          >
            <ChatStreamProvider viewerRole="Tenant">
              <Probe />
              <AssistantFabClient
                workspaceName="Demo workspace"
                conversationId={null}
                initialMessages={[]}
              />
            </ChatStreamProvider>
          </LeaseParserProvider>
        </AssistantFabProvider>,
      );

      act(() => {
        holder.fab?.openWith({
          initialPrompt: 'Explain this clause',
          clauseId: 'c-deposit',
          severity: 'high',
          statuteCitation: 'NJ Stat 46:8-19',
        });
      });

      await screen.findByTestId('assistant-fab-drawer');
      // Focus row visible when selection is set.
      const focusRow = await screen.findByTestId('assistant-context-bar-focus');
      expect(focusRow).toBeInTheDocument();
      // Click the detach × button.
      fireEvent.click(screen.getByTestId('assistant-context-bar-detach'));
      // Focus row disappears.
      expect(
        screen.queryByTestId('assistant-context-bar-focus'),
      ).not.toBeInTheDocument();
      // selection state cleared; pendingPrompt preserved (detach
      // semantics from Sprint 29.3 context-spec test).
      expect(holder.fab?.selection.clauseId).toBeNull();
      expect(holder.fab?.pendingPrompt).toBe('Explain this clause');
      // Drawer still open.
      expect(holder.fab?.state).toBe('drawer');
    });
  });

  // Sprint 29.5 — transient undo toast after the user clears the
  // assistant chat. The aria-live announcement (Sprint 28.8 / 29.1)
  // covers SR users; this toast adds a visible safety net for
  // sighted users with a single [Undo] action wired to the existing
  // previousMessages stash. Toast is auto-dismiss only (~6s); no
  // manual dismiss × per the spec.
  describe('Sprint 29.5 — undo toast', () => {
    it('clearing assistant chat shows a toast with the safety-net copy + an [Undo] button', async () => {
      render(
        <AssistantFabProvider>
          <LeaseParserProvider>
            <ChatStreamProvider viewerRole="Tenant">
              <AssistantFabClient
                workspaceName="Demo workspace"
                conversationId="conv-1"
                initialMessages={[
                  { id: 'm-1', role: 'user', content: 'First question' },
                  { id: 'm-2', role: 'assistant', content: 'First answer' },
                ]}
              />
            </ChatStreamProvider>
          </LeaseParserProvider>
        </AssistantFabProvider>,
      );

      fireEvent.click(screen.getByTestId('assistant-fab'));
      await screen.findByTestId('assistant-fab-drawer');

      fireEvent.click(screen.getByTestId('new-conversation-btn'));

      const toast = await screen.findByTestId('assistant-undo-toast');
      expect(toast.textContent ?? '').toMatch(
        /chat cleared.*lease.*preserved/i,
      );
      const undoBtn = within(toast).getByRole('button', { name: /undo/i });
      expect(undoBtn).toBeInTheDocument();
    });

    it('clicking [Undo] in the toast restores the previous messages', async () => {
      render(
        <AssistantFabProvider>
          <LeaseParserProvider>
            <ChatStreamProvider viewerRole="Tenant">
              <AssistantFabClient
                workspaceName="Demo workspace"
                conversationId="conv-1"
                initialMessages={[
                  { id: 'm-1', role: 'user', content: 'Restored question' },
                  { id: 'm-2', role: 'assistant', content: 'Restored answer' },
                ]}
              />
            </ChatStreamProvider>
          </LeaseParserProvider>
        </AssistantFabProvider>,
      );

      fireEvent.click(screen.getByTestId('assistant-fab'));
      await screen.findByTestId('assistant-fab-drawer');

      // Sanity: original messages are visible.
      expect(screen.getByText(/restored question/i)).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('new-conversation-btn'));

      // After clearing, the original messages are gone from the
      // transcript view.
      expect(screen.queryByText(/restored question/i)).not.toBeInTheDocument();

      const toast = await screen.findByTestId('assistant-undo-toast');
      fireEvent.click(within(toast).getByRole('button', { name: /undo/i }));

      // After Undo, the previous transcript re-appears.
      expect(await screen.findByText(/restored question/i)).toBeInTheDocument();
      expect(screen.getByText(/restored answer/i)).toBeInTheDocument();
    });

    it('auto-dismisses the toast after ~6 seconds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        render(
          <AssistantFabProvider>
            <LeaseParserProvider>
              <ChatStreamProvider viewerRole="Tenant">
                <AssistantFabClient
                  workspaceName="Demo workspace"
                  conversationId="conv-1"
                  initialMessages={[
                    { id: 'm-1', role: 'user', content: 'q' },
                    { id: 'm-2', role: 'assistant', content: 'a' },
                  ]}
                />
              </ChatStreamProvider>
            </LeaseParserProvider>
          </AssistantFabProvider>,
        );

        fireEvent.click(screen.getByTestId('assistant-fab'));
        await screen.findByTestId('assistant-fab-drawer');

        fireEvent.click(screen.getByTestId('new-conversation-btn'));

        // Toast is mounted immediately.
        const toast = await screen.findByTestId('assistant-undo-toast');
        expect(toast).toBeInTheDocument();

        // Advance past the auto-dismiss window.
        act(() => {
          vi.advanceTimersByTime(7000);
        });

        expect(
          screen.queryByTestId('assistant-undo-toast'),
        ).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Sprint 29.4 — job-aware empty-state subhead end-to-end check.
  // With no lease, the real ChatTranscript + scan-narrative path
  // doesn't inject any synthetic intro, so the compact header renders
  // and its rendered subhead reflects the FAB's job-aware selector.
  // The unit suite (AssistantFab.client.test.tsx) covers all three
  // stages via the ChatUI mock; this integration test pins the
  // end-to-end render for the no-lease case.
  it('Sprint 29.4 — empty-state subhead reflects the parser stage (no-lease, end-to-end)', async () => {
    render(
      <AssistantFabProvider>
        <LeaseParserProvider>
          <ChatStreamProvider viewerRole="Tenant">
            <AssistantFabClient
              workspaceName="Demo workspace"
              conversationId={null}
              initialMessages={[]}
            />
          </ChatStreamProvider>
        </LeaseParserProvider>
      </AssistantFabProvider>,
    );
    fireEvent.click(screen.getByTestId('assistant-fab'));
    const header = await screen.findByTestId('assistant-drawer-empty-header');
    expect(header.textContent ?? '').toMatch(/no lease attached yet/i);
  });

  // Sprint 29.2 — the drawer shouldn't feel like a second homepage.
  // The big "Find what to negotiate" hero (ChatEmptyState) is suppressed
  // inside the FAB drawer; a compact in-drawer header takes its place.
  // Outside the FAB (e.g. legacy LeaseLensWorkspaceShell), the hero
  // still renders so non-FAB surfaces don't regress.
  it('Sprint 29.2 — drawer empty state suppresses the homepage hero and shows a compact header', async () => {
    render(
      <AssistantFabProvider>
        <LeaseParserProvider>
          <ChatStreamProvider viewerRole="Tenant">
            <AssistantFabClient
              workspaceName="Demo workspace"
              conversationId={null}
              initialMessages={[]}
            />
          </ChatStreamProvider>
        </LeaseParserProvider>
      </AssistantFabProvider>,
    );

    fireEvent.click(screen.getByTestId('assistant-fab'));
    await screen.findByTestId('assistant-fab-drawer');

    // The big landing hero is NOT mounted inside the drawer…
    expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
    // …a compact header is rendered in its place.
    const header = await screen.findByTestId('assistant-drawer-empty-header');
    expect(header.textContent ?? '').toMatch(/leaselens assistant/i);
    // Subhead content varies by parser stage (Sprint 29.4 pins each
    // case in its own dedicated test). Here we just assert that *a*
    // subhead is present and that the suppression of the homepage
    // hero is in place.
  });

  it('openWith seeds the composer + submitting posts the prompt to /api/chat', async () => {
    // Capture the FAB context handle via a mutable ref-style holder.
    // A `let` binding gets narrowed to `null` by TS because it can't
    // see the inner-component assignment; the holder dodges that.
    const holder: { fab: ReturnType<typeof useAssistantFab> | null } = {
      fab: null,
    };
    function Probe(): null {
      holder.fab = useAssistantFab();
      return null;
    }

    render(
      <AssistantFabProvider>
        <LeaseParserProvider>
          <ChatStreamProvider viewerRole="Tenant">
            <Probe />
            <AssistantFabClient
              workspaceName="Demo workspace"
              conversationId={null}
              initialMessages={[]}
            />
          </ChatStreamProvider>
        </LeaseParserProvider>
      </AssistantFabProvider>,
    );

    // Open the drawer with a seeded prompt — mirrors what
    // RedFlagReport's Explain button does in production.
    act(() => {
      holder.fab?.openWith({ initialPrompt: 'Explain clause §3.' });
    });

    const drawer = await screen.findByTestId('assistant-fab-drawer');
    expect(drawer).toBeInTheDocument();

    // The composer's textarea picks up the prefill.
    const textarea = await screen.findByLabelText('Type a message');
    expect((textarea as HTMLTextAreaElement).value).toBe('Explain clause §3.');

    // Hit Enter to submit. ChatUI fires fetch('/api/chat', { ... }).
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    // Inspect the request body: the seeded prompt should be the
    // outgoing user message.
    const [url, init] = fetchSpy.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(String(url)).toMatch(/\/api\/chat$/);
    const sent = JSON.parse(String(init?.body ?? '{}')) as {
      message?: string;
    };
    expect(sent.message).toBe('Explain clause §3.');
  });

  it('typed draft survives a close→open cycle', async () => {
    // Sprint 27 — acceptance criterion: closing the FAB must not
    // delete an unsent draft. The user types a prefill + extra text,
    // closes, and reopens; the textarea retains everything.
    const holder: { fab: ReturnType<typeof useAssistantFab> | null } = {
      fab: null,
    };
    function Probe(): null {
      holder.fab = useAssistantFab();
      return null;
    }

    render(
      <AssistantFabProvider>
        <LeaseParserProvider>
          <ChatStreamProvider viewerRole="Tenant">
            <Probe />
            <AssistantFabClient
              workspaceName="Demo workspace"
              conversationId={null}
              initialMessages={[]}
            />
          </ChatStreamProvider>
        </LeaseParserProvider>
      </AssistantFabProvider>,
    );

    act(() => {
      holder.fab?.openWith({ initialPrompt: 'Explain clause §3.' });
    });
    const textarea = (await screen.findByLabelText(
      'Type a message',
    )) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Explain clause §3.');

    // User appends a question to the prefill.
    fireEvent.change(textarea, {
      target: { value: 'Explain clause §3. Also §5?' },
    });
    expect(textarea.value).toBe('Explain clause §3. Also §5?');

    // Close the FAB. State should go to closed but the drawer DOM
    // and the composer state must persist.
    fireEvent.click(screen.getByTestId('assistant-fab-close'));
    expect(holder.fab?.state).toBe('closed');

    // Reopen via openDrawer (no new prefill).
    act(() => {
      holder.fab?.openDrawer();
    });

    // Same textarea node, same value.
    const textareaAfter = (await screen.findByLabelText(
      'Type a message',
    )) as HTMLTextAreaElement;
    expect(textareaAfter.value).toBe('Explain clause §3. Also §5?');
  });

  it('clause selection context survives close→open', () => {
    // Sprint 27 — when the user clicks "Explain this clause" on a
    // red-flag card, AssistantFabContext stores the clauseId so the
    // chip set knows what's selected. That selection must outlive
    // a close→open cycle.
    const holder: { fab: ReturnType<typeof useAssistantFab> | null } = {
      fab: null,
    };
    function Probe(): null {
      holder.fab = useAssistantFab();
      return null;
    }

    render(
      <AssistantFabProvider>
        <LeaseParserProvider>
          <ChatStreamProvider viewerRole="Tenant">
            <Probe />
            <AssistantFabClient
              workspaceName="Demo workspace"
              conversationId={null}
              initialMessages={[]}
            />
          </ChatStreamProvider>
        </LeaseParserProvider>
      </AssistantFabProvider>,
    );

    act(() => {
      holder.fab?.openWith({
        initialPrompt: 'Explain clause §3.',
        clauseId: 'clause-3',
        severity: 'high',
        statuteCitation: 'NJ Stat 46:8-19',
      });
    });
    expect(holder.fab?.selection.clauseId).toBe('clause-3');

    fireEvent.click(screen.getByTestId('assistant-fab-close'));
    expect(holder.fab?.state).toBe('closed');
    expect(holder.fab?.selection.clauseId).toBe('clause-3');
    expect(holder.fab?.selection.severity).toBe('high');
    expect(holder.fab?.selection.statuteCitation).toBe('NJ Stat 46:8-19');

    act(() => {
      holder.fab?.openDrawer();
    });
    expect(holder.fab?.selection.clauseId).toBe('clause-3');
  });

  // Sprint 29.11 — "Scan complete" banner inside the FAB drawer.
  //
  // Pairs with Sprint 29.10 (system-prompt scan-progress awareness).
  // When the user opens the FAB mid-scan, asks about findings, and
  // gets the partial-state answer (e.g. "I see 7 of 15 graded so
  // far"), the scan continues to completion in the background. The
  // banner appears AT the moment the scan transitions to
  // review_ready WHILE the drawer is open, giving the user a clear
  // "things changed — ask again now" cue (Jakob Nielsen: visibility
  // of system status). Persistent until dismissed or until the user
  // sends a new message (Steve Krug: don't make the user think).
  //
  // Testing strategy: React doesn't re-render when JSX is structurally
  // identical, so a naked `rerender(<sameTree>)` won't cause
  // `useScanLifecycle` to be called again. The `LifecycleDriver` probe
  // below exposes a forceTick setter via ref — when the test changes
  // the lifecycleMock return value and then calls forceTick(), the
  // driver re-renders, propagating through the tree and re-invoking
  // useScanLifecycle. This mirrors the real-browser behavior where
  // toolEvents arriving in LeaseParserContext drive lifecycle state.
  describe('Sprint 29.11 — scan-complete banner', () => {
    function makeDriver(): {
      forceTick: () => void;
      tickRef: { current: () => void };
    } {
      const tickRef: { current: () => void } = { current: () => {} };
      return { forceTick: () => tickRef.current(), tickRef };
    }

    // Wrapper owns the tick state at the top of the tree so a forceTick
    // call re-renders ALL descendants — that's the trick to make
    // `useScanLifecycle()` re-evaluate the (now-updated) mock value.
    function TestHost({
      tickRef,
      holder,
    }: {
      tickRef: { current: () => void };
      holder: { fab: ReturnType<typeof useAssistantFab> | null };
    }): React.JSX.Element {
      const [, setTick] = useState(0);
      tickRef.current = () => setTick((n: number) => n + 1);
      function Probe(): null {
        holder.fab = useAssistantFab();
        return null;
      }
      return (
        <AssistantFabProvider>
          <LeaseParserProvider>
            <ChatStreamProvider viewerRole="Tenant">
              <Probe />
              <AssistantFabClient
                workspaceName="Demo workspace"
                conversationId="conv-1"
                initialMessages={[]}
              />
            </ChatStreamProvider>
          </LeaseParserProvider>
        </AssistantFabProvider>
      );
    }

    function renderFabWithDrawerOpen(opts: {
      tickRef: { current: () => void };
    }) {
      const holder: { fab: ReturnType<typeof useAssistantFab> | null } = {
        fab: null,
      };
      const result = render(
        <TestHost tickRef={opts.tickRef} holder={holder} />,
      );
      // Open the drawer so the banner gate (fab.state === 'drawer')
      // is satisfied for tests that depend on it.
      fireEvent.click(screen.getByTestId('assistant-fab'));
      return { ...result, holder };
    }

    it('shows the banner when scan transitions to review_ready while the drawer is open', async () => {
      const { forceTick, tickRef } = makeDriver();
      // Initial mount: mid-scan, drawer opens with no banner yet.
      lifecycleMock.mockReturnValue(MID_SCAN_LIFECYCLE);
      const { holder } = renderFabWithDrawerOpen({ tickRef });
      expect(holder.fab?.state).toBe('drawer');
      expect(
        screen.queryByTestId('assistant-scan-complete-banner'),
      ).not.toBeInTheDocument();

      // Lifecycle transitions to review_ready while the drawer is open.
      // Update the mock + force the tree to re-render via the driver.
      act(() => {
        lifecycleMock.mockReturnValue(REVIEW_READY_LIFECYCLE);
        forceTick();
      });

      const banner = await screen.findByTestId(
        'assistant-scan-complete-banner',
      );
      expect(banner.textContent ?? '').toMatch(/scan complete/i);
      expect(banner.textContent ?? '').toMatch(/ask me about/i);
      // aria-live so SR users are notified of the change.
      expect(banner).toHaveAttribute('role', 'status');
    });

    it('does NOT show the banner if scan was already complete when the drawer opened', () => {
      const { tickRef } = makeDriver();
      // Initial mount with the lifecycle ALREADY at review_ready —
      // no scanning→complete transition occurs during this session,
      // so the banner stays hidden (no spurious "scan complete" cue
      // for a user who arrived after the fact).
      lifecycleMock.mockReturnValue(REVIEW_READY_LIFECYCLE);
      renderFabWithDrawerOpen({ tickRef });
      expect(
        screen.queryByTestId('assistant-scan-complete-banner'),
      ).not.toBeInTheDocument();
    });

    it('does NOT show the banner when the only transition is preparing_red_flags → review_ready (rehydrated scan)', async () => {
      // Sprint 29.11 regression: useScanLifecycle has an internal 650ms
      // timer that flips preparing_red_flags → review_ready as a
      // cosmetic beat (Sprint 28.1 documented preparing_red_flags as
      // a decorative hold, not real scan work). When a user lands on
      // a page with a rehydrated complete scan, the timer fires and
      // produces this transition automatically — even though the user
      // never witnessed any actual scanning. The banner must NOT
      // appear in that case (Playwright surfaced this false positive
      // on a fresh page load with the seeded sample conversation).
      const { forceTick, tickRef } = makeDriver();
      lifecycleMock.mockReturnValue(PREPARING_LIFECYCLE);
      renderFabWithDrawerOpen({ tickRef });
      act(() => {
        lifecycleMock.mockReturnValue(REVIEW_READY_LIFECYCLE);
        forceTick();
      });
      // No banner — the decorative beat doesn't count as "scan just
      // finished" from the user's perspective.
      expect(
        screen.queryByTestId('assistant-scan-complete-banner'),
      ).not.toBeInTheDocument();
    });

    it('dismisses the banner when the user clicks the × button', async () => {
      const { forceTick, tickRef } = makeDriver();
      lifecycleMock.mockReturnValue(MID_SCAN_LIFECYCLE);
      renderFabWithDrawerOpen({ tickRef });
      act(() => {
        lifecycleMock.mockReturnValue(REVIEW_READY_LIFECYCLE);
        forceTick();
      });

      const banner = await screen.findByTestId(
        'assistant-scan-complete-banner',
      );
      fireEvent.click(
        within(banner).getByTestId('assistant-scan-complete-banner-dismiss'),
      );
      expect(
        screen.queryByTestId('assistant-scan-complete-banner'),
      ).not.toBeInTheDocument();
    });
  });
});
