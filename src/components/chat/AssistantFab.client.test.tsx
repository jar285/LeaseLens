// Sprint 26c Phase 3 — red test.
//
// The real FAB. Reads from AssistantFabContext to decide what to render
// (pill / menu / drawer). Mocks ChatUI so the test focuses on the FAB's
// own composition + a11y semantics, not the chat stream itself.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaseParserProvider } from '@/components/lease/LeaseParserContext';
import { AssistantFabProvider, useAssistantFab } from './AssistantFabContext';
import { ChatStreamProvider } from './ChatStreamContext';

// Sprint 29.4 — useScanLifecycle has a 650ms internal timer for the
// preparing_red_flags → review_ready transition. This file's unit
// tests are about the chip-set selector logic, not the lifecycle
// state machine, so we mock the hook with a per-test stage. The
// integration spec exercises the real hook end-to-end via the
// scan-progress + grading-event pipeline.
const scanLifecycleMock = vi.fn();
vi.mock('@/components/lease/scan-lifecycle', () => ({
  useScanLifecycle: () => scanLifecycleMock(),
}));

// Sprint 27.1 — the ChatUI mock now surfaces the new `suggestedPrompts`
// + `onSelectSuggestion` props so the FAB-level unit tests can assert
// that the FAB wires its quick-action chips into the drawer correctly
// without rendering the full ChatUI tree. Integration tests
// (AssistantFab.integration.test.tsx) cover the end-to-end behavior
// with the real ChatUI.
vi.mock('./ChatUI', () => ({
  ChatUI: (props: {
    initialComposerText?: string;
    suggestedPrompts?: Array<{
      id: string;
      label: string;
      prompt: string;
      disabled?: boolean;
    }>;
    onSelectSuggestion?: (prompt: string) => void;
    // Sprint 29.4 — capture the empty-state subhead so we can assert
    // the FAB passes job-aware copy per parser stage without needing
    // the real ChatUI / ChatTranscript / scan-narrative tree mounted.
    emptyStateSubhead?: string;
  }) => (
    <div
      data-testid="chat-ui-mock"
      data-prefill={props.initialComposerText ?? ''}
      data-empty-state-subhead={props.emptyStateSubhead ?? ''}
    >
      ChatUI mock
      {props.suggestedPrompts?.map((s) => (
        <button
          key={s.id}
          type="button"
          data-testid="chat-ui-mock-suggestion"
          data-suggestion-id={s.id}
          disabled={s.disabled}
          onClick={() => props.onSelectSuggestion?.(s.prompt)}
        >
          {s.label}
        </button>
      ))}
    </div>
  ),
}));

import { AssistantFabClient } from './AssistantFab.client';

// Sprint 29.4 — lifecycle mock defaults. Each test overrides as needed.
// Default = idle (no lease, no scan in flight); the pre-29.4 tests that
// expect the post-scan four-chip set must override to review_ready.
const IDLE_SNAPSHOT = {
  stage: 'idle' as const,
  index: -1,
  label: '',
  detail: null,
  progress: { phase: 'idle' as const, total: 0, attempted: 0, label: '' },
};
const REVIEW_READY_SNAPSHOT = {
  stage: 'review_ready' as const,
  index: 5,
  label: 'Review ready',
  detail: null,
  progress: {
    phase: 'complete' as const,
    total: 1,
    attempted: 1,
    label: '',
  },
};
const MID_SCAN_SNAPSHOT = {
  stage: 'checking_clauses' as const,
  index: 3,
  label: 'Checking clauses against NJ tenant-law rules',
  detail: 'Grading 1 of 5',
  progress: {
    phase: 'grading' as const,
    total: 5,
    attempted: 1,
    label: '',
  },
};

beforeEach(() => {
  scanLifecycleMock.mockReturnValue(IDLE_SNAPSHOT);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Helper that renders the FAB inside both providers it needs and
// exposes the FAB context handle for test-side state pokes.
// Sprint 29.4 — accepts optional `activeLease` + `initialEvents` so
// the three job-aware-chips states (no lease / scanning / scan
// complete) can each be set up declaratively.
function renderFab(
  options: {
    activeLease?: React.ComponentProps<
      typeof LeaseParserProvider
    >['activeLease'];
    initialEvents?: React.ComponentProps<
      typeof LeaseParserProvider
    >['initialEvents'];
  } = {},
): {
  fab: ReturnType<typeof useAssistantFab> | null;
} {
  const ref: { fab: ReturnType<typeof useAssistantFab> | null } = {
    fab: null,
  };
  function Spy(): null {
    ref.fab = useAssistantFab();
    return null;
  }
  render(
    <AssistantFabProvider>
      <LeaseParserProvider
        activeLease={options.activeLease}
        initialEvents={options.initialEvents}
      >
        <ChatStreamProvider viewerRole="Tenant">
          <Spy />
          <AssistantFabClient
            workspaceName="Demo"
            conversationId={null}
            initialMessages={[]}
          />
        </ChatStreamProvider>
      </LeaseParserProvider>
    </AssistantFabProvider>,
  );
  return ref;
}

describe('AssistantFabClient', () => {
  it('renders only the closed pill when state is "closed"', () => {
    renderFab();
    const pill = screen.getByTestId('assistant-fab');
    expect(pill).toBeInTheDocument();
    expect(pill.tagName).toBe('BUTTON');
    // Sprint 29.6 — aria-label now includes the state-aware suffix
    // ("Open assistant — Help" / "… — Scanning…" / "… — Ask about
    // lease") so SR users hear the same signal sighted lg+ users see
    // on the visible pill label. We match the prefix here; the
    // Sprint 29.6 describe block below pins the state-specific suffix.
    expect(pill.getAttribute('aria-label')).toMatch(/^open assistant/i);
    expect(pill).toHaveAttribute('type', 'button');
    expect(screen.queryByTestId('assistant-fab-menu')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('assistant-fab-drawer'),
    ).not.toBeInTheDocument();
  });

  it('clicking the pill opens the drawer directly (no menu gate)', () => {
    // Sprint 27.1 — the menu popup is removed. Click → drawer with
    // an empty composer; quick actions migrate inside the drawer as
    // suggestion chips. The legacy menu testid must not appear.
    //
    // NOTE: we read `ctx.fab` (not a destructured `fab`) because the
    // context value is recreated by useMemo on each state change. A
    // captured destructure points to the stale pre-click value; the
    // ref holder always exposes the latest.
    const ctx = renderFab();
    fireEvent.click(screen.getByTestId('assistant-fab'));
    expect(ctx.fab?.state).toBe('drawer');
    expect(screen.getByTestId('assistant-fab-drawer')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-fab-menu')).not.toBeInTheDocument();
    // No prefill text — the composer opens blank.
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('');
  });

  it('passes quick-action chips into the drawer as suggested prompts', () => {
    // Sprint 27.1 — the four CHIPS that used to live in the menu popup
    // are now passed to ChatUI as `suggestedPrompts`. We assert the
    // count + that the always-enabled "citation" chip is present and
    // not disabled.
    // Sprint 29.4 — the chip count + identities depend on
    // lifecycle.stage; we seed review_ready + an activeLease so the
    // post-scan four-chip set is selected (matches this test's
    // original intent: prove the FAB wires the chip set into ChatUI).
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    renderFab({
      activeLease: {
        lease_id: 'l-ready',
        filename: 'ready.pdf',
        page_count: 2,
        clause_count: 1,
        pdfUrl: 'blob:test',
      },
    });
    fireEvent.click(screen.getByTestId('assistant-fab'));
    const suggestions = screen.getAllByTestId('chat-ui-mock-suggestion');
    expect(suggestions).toHaveLength(4);
    const citationChip = suggestions.find(
      (s) => s.getAttribute('data-suggestion-id') === 'understand-citation',
    );
    expect(citationChip).toBeDefined();
    expect(citationChip).not.toBeDisabled();
  });

  it("clicking an in-drawer suggestion chip seeds the composer with that chip's prompt", () => {
    // Sprint 27.1 — equivalent to the old "chip opens drawer with
    // prefill" test, but the chip now lives inside the open drawer
    // rather than in a separate popup menu.
    // Sprint 29.4 — `understand-citation` lives in the post-scan
    // chip set, so seed review_ready + activeLease.
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    renderFab({
      activeLease: {
        lease_id: 'l-ready',
        filename: 'ready.pdf',
        page_count: 2,
        clause_count: 1,
        pdfUrl: 'blob:test',
      },
    });
    fireEvent.click(screen.getByTestId('assistant-fab'));
    const citationChip = screen
      .getAllByTestId('chat-ui-mock-suggestion')
      .find(
        (s) => s.getAttribute('data-suggestion-id') === 'understand-citation',
      );
    if (!citationChip) throw new Error('expected citation suggestion chip');
    fireEvent.click(citationChip);
    expect(screen.getByTestId('assistant-fab-drawer')).toBeInTheDocument();
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toMatch(/citation/i);
  });

  it('calling openWith from context jumps directly to the drawer with the supplied prompt', () => {
    const { fab } = renderFab();
    act(() => {
      fab?.openWith({ initialPrompt: 'Custom seeded prompt' });
    });
    expect(screen.getByTestId('assistant-fab-drawer')).toBeInTheDocument();
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('Custom seeded prompt');
  });

  it('renders the drawer as aria-modal with a labelled heading', () => {
    const { fab } = renderFab();
    act(() => {
      fab?.openDrawer();
    });
    const drawer = screen.getByTestId('assistant-fab-drawer');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    const labelledBy = drawer.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy ?? '');
    expect(heading).not.toBeNull();
    expect(heading?.textContent?.toLowerCase()).toContain('assistant');
  });

  it('does not emit a React 19 boolean-attribute warning for inert when closing the drawer', () => {
    // Sprint 27.1 — React 19 rejects `inert=""` (empty-string idiom).
    // Both `inert=""` and `inert={true}` serialize to the same DOM
    // attribute, so a DOM-only assertion can't catch this regression.
    // We spy on console.error (React fires the warning there) and
    // assert no inert-related warning fires during a full open→close
    // cycle. The hasAttribute check below is a secondary sanity probe.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { fab } = renderFab();
      act(() => {
        fab?.openDrawer();
      });
      const drawerOpen = screen.getByTestId('assistant-fab-drawer');
      expect(drawerOpen.hasAttribute('inert')).toBe(false);

      fireEvent.click(screen.getByTestId('assistant-fab-close'));
      const drawerClosed = screen.getByTestId('assistant-fab-drawer');
      expect(drawerClosed.hasAttribute('inert')).toBe(true);

      const inertWarnings = errorSpy.mock.calls.filter((args) => {
        const msg = String(args[0] ?? '');
        return (
          msg.includes('boolean attribute') &&
          msg.toLowerCase().includes('inert')
        );
      });
      expect(inertWarnings).toHaveLength(0);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('clicking the drawer close button hides the drawer but keeps it mounted so chat state survives', () => {
    // Sprint 27 — close() now hides the drawer instead of unmounting
    // it. The DOM node persists so ChatUI's transcript and composer
    // draft survive a close→open cycle. We assert the FAB state
    // transitions to "closed" and the drawer is aria-hidden + hidden,
    // but still present in the DOM.
    const { fab } = renderFab();
    act(() => {
      fab?.openDrawer();
    });
    const drawerOpen = screen.getByTestId('assistant-fab-drawer');
    expect(drawerOpen).toBeInTheDocument();
    expect(drawerOpen).not.toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByTestId('assistant-fab-close'));

    const drawerClosed = screen.getByTestId('assistant-fab-drawer');
    expect(drawerClosed).toBeInTheDocument();
    expect(drawerClosed).toHaveAttribute('aria-hidden', 'true');
    expect(drawerClosed).toHaveAttribute('data-state', 'closed');
    expect(fab?.state).toBe('closed');
    expect(screen.getByTestId('assistant-fab')).toBeInTheDocument();
  });

  it('Escape on the drawer hides it (state goes to closed, DOM persists)', () => {
    const { fab } = renderFab();
    act(() => {
      fab?.openDrawer();
    });
    const drawer = screen.getByTestId('assistant-fab-drawer');
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(fab?.state).toBe('closed');
    expect(screen.getByTestId('assistant-fab-drawer')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('drawer does not mount before first open (lazy mount)', () => {
    // Don't open the drawer at all; only the pill renders.
    renderFab();
    expect(screen.getByTestId('assistant-fab')).toBeInTheDocument();
    expect(
      screen.queryByTestId('assistant-fab-drawer'),
    ).not.toBeInTheDocument();
  });

  it('reopening the drawer after close keeps the same ChatUI instance and prefill', () => {
    // Sprint 27 — the drawer should not remount on reopen. We use the
    // ChatUI mock's data-prefill attribute as a coarse proxy for
    // "same instance"; since we don't re-key on pendingPrompt, the
    // prefill stays addressable across cycles.
    const { fab } = renderFab();
    act(() => {
      fab?.openWith({ initialPrompt: 'First open prefill' });
    });
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('First open prefill');

    fireEvent.click(screen.getByTestId('assistant-fab-close'));
    // Drawer hidden but still mounted; prefill still readable.
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('First open prefill');

    act(() => {
      fab?.openDrawer();
    });
    expect(screen.getByTestId('assistant-fab-drawer')).toHaveAttribute(
      'data-state',
      'drawer',
    );
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('First open prefill');
  });

  it('disables the "Explain this clause" suggestion when no clause is selected', () => {
    // Sprint 27.1 — same gating logic, new surface. The chip is now
    // a suggestedPrompts entry inside the drawer; it's marked disabled
    // when ChatStreamContext has no activeClauseId.
    // Sprint 29.4 — `renderFab()` defaults to no lease + idle lifecycle,
    // which switches the chip set to the onboarding three. Seed
    // review_ready + an activeLease so the post-scan four-chip set
    // is selected (`explain-clause` only exists there).
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    renderFab({
      activeLease: {
        lease_id: 'l-1',
        filename: 'sample.pdf',
        page_count: 2,
        clause_count: 1,
        pdfUrl: 'blob:test',
      },
      initialEvents: [
        {
          tool_name: 'grade_clause_severity',
          input: { clause_id: 'c-1' },
          audit_id: undefined,
          result: {
            clause_id: 'c-1',
            clause_type: 'security_deposit',
            clause_index: 3,
            severity: 'high',
            chunk_id: 'chk-1',
            statute_citation: 'NJ Stat 46:8-19',
            reasoning: 'Test reasoning',
          },
        },
      ],
    });
    fireEvent.click(screen.getByTestId('assistant-fab'));
    const explainChip = screen
      .getAllByTestId('chat-ui-mock-suggestion')
      .find((s) => s.getAttribute('data-suggestion-id') === 'explain-clause');
    expect(explainChip).toBeDefined();
    expect(explainChip).toBeDisabled();
  });

  // Sprint 29.4 — job-aware chip set. The chip row shown inside the
  // drawer depends on the parser's current stage so the assistant
  // never offers a clause-specific suggestion the user can't act on:
  //   - no lease     → onboarding chips ("how does LeaseLens work?" …)
  //   - mid-scan     → mid-scan chips    ("what is it checking?" …)
  //   - scan complete → the prior four chips (explain / draft / summarise / citation)
  describe('Sprint 29.4 — job-aware chip set', () => {
    function suggestionIds(): string[] {
      return screen
        .getAllByTestId('chat-ui-mock-suggestion')
        .map((s) => s.getAttribute('data-suggestion-id') ?? '');
    }

    it('renders the onboarding chip set when there is no lease', () => {
      // beforeEach already returns IDLE_SNAPSHOT (no lease, no scan).
      renderFab();
      fireEvent.click(screen.getByTestId('assistant-fab'));
      const ids = suggestionIds();
      expect(ids).toEqual(['how-it-works', 'what-it-checks', 'after-upload']);
    });

    it('renders the mid-scan chip set while a lease is being processed', () => {
      scanLifecycleMock.mockReturnValue(MID_SCAN_SNAPSHOT);
      renderFab({
        activeLease: {
          lease_id: 'l-mid',
          filename: 'mid-scan.pdf',
          page_count: 1,
          clause_count: 5,
          pdfUrl: 'blob:test',
        },
      });
      fireEvent.click(screen.getByTestId('assistant-fab'));
      const ids = suggestionIds();
      expect(ids).toEqual([
        'what-checking',
        'how-read-flags',
        'after-scanning',
      ]);
    });

    it('renders the scan-complete chip set once the scan reaches review_ready', () => {
      scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
      renderFab({
        activeLease: {
          lease_id: 'l-done',
          filename: 'done.pdf',
          page_count: 2,
          clause_count: 1,
          pdfUrl: 'blob:test',
        },
      });
      fireEvent.click(screen.getByTestId('assistant-fab'));
      const ids = suggestionIds();
      expect(ids).toEqual([
        'explain-clause',
        'draft-email',
        'summarize-risks',
        'understand-citation',
      ]);
    });

    // Empty-state subhead mirrors the chip set; the FAB owns the copy
    // and passes it to ChatUI as a prop. Asserting via the ChatUI mock
    // keeps the test focused on the FAB-side logic instead of the
    // scan-narrative + transcript merge path that the integration
    // suite already covers.
    function subhead(): string {
      return (
        screen
          .getByTestId('chat-ui-mock')
          .getAttribute('data-empty-state-subhead') ?? ''
      );
    }

    it('no lease → "No lease attached yet…" subhead is passed to ChatUI', () => {
      renderFab();
      fireEvent.click(screen.getByTestId('assistant-fab'));
      expect(subhead()).toMatch(/no lease attached yet/i);
    });

    it('mid-scan → "Scanning your lease…" subhead is passed to ChatUI', () => {
      scanLifecycleMock.mockReturnValue(MID_SCAN_SNAPSHOT);
      renderFab({
        activeLease: {
          lease_id: 'l-mid',
          filename: 'mid-scan.pdf',
          page_count: 1,
          clause_count: 5,
          pdfUrl: 'blob:test',
        },
      });
      fireEvent.click(screen.getByTestId('assistant-fab'));
      expect(subhead()).toMatch(/scanning your lease/i);
    });

    it('scan complete → "Ask about this lease…" subhead is passed to ChatUI', () => {
      scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
      renderFab({
        activeLease: {
          lease_id: 'l-done',
          filename: 'done.pdf',
          page_count: 2,
          clause_count: 1,
          pdfUrl: 'blob:test',
        },
      });
      fireEvent.click(screen.getByTestId('assistant-fab'));
      expect(subhead()).toMatch(/ask about this lease/i);
    });
  });

  // Sprint 29.6 — FAB pill state label on lg+. Mobile keeps the
  // existing 64×64 icon-only pill; lg+ adds a visible label that
  // tracks the parser stage. The aria-label always matches the
  // visible label so screen-reader users get the same information
  // regardless of viewport.
  describe('Sprint 29.6 — FAB pill state label', () => {
    function pillLabel(): string {
      return (
        screen.getByTestId('assistant-fab-pill-label').textContent?.trim() ?? ''
      );
    }
    function pillAriaLabel(): string {
      return (
        screen.getByTestId('assistant-fab').getAttribute('aria-label') ?? ''
      );
    }

    it('no lease → label is "Help"', () => {
      renderFab(); // default lifecycle: idle
      expect(pillLabel()).toBe('Help');
      expect(pillAriaLabel()).toMatch(/help/i);
    });

    it('lease attached, mid-scan → label is "Scanning…"', () => {
      scanLifecycleMock.mockReturnValue(MID_SCAN_SNAPSHOT);
      renderFab({
        activeLease: {
          lease_id: 'l-mid',
          filename: 'mid.pdf',
          page_count: 1,
          clause_count: 5,
          pdfUrl: 'blob:test',
        },
      });
      expect(pillLabel()).toBe('Scanning…');
      expect(pillAriaLabel()).toMatch(/scanning/i);
    });

    it('scan complete → label is "Ask about lease"', () => {
      scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
      renderFab({
        activeLease: {
          lease_id: 'l-done',
          filename: 'done.pdf',
          page_count: 2,
          clause_count: 1,
          pdfUrl: 'blob:test',
        },
      });
      expect(pillLabel()).toBe('Ask about lease');
      expect(pillAriaLabel()).toMatch(/ask about lease/i);
    });

    it('the label is hidden on mobile (uses hidden + lg:inline)', () => {
      renderFab();
      const label = screen.getByTestId('assistant-fab-pill-label');
      // The label sits inside a span with `hidden lg:inline` so it
      // collapses on mobile and appears on lg+ viewports. jsdom
      // doesn't enforce media queries; we just pin the className so
      // the responsive contract doesn't regress silently.
      expect(label.className).toMatch(/\bhidden\b/);
      expect(label.className).toMatch(/\blg:inline\b/);
    });
  });

  // Sprint 29.7 — accessibility audit. Pin the production-readiness
  // contract: touch targets ≥44×44 on every interactive affordance
  // the FAB owns, and focus returns to the pill when the drawer
  // closes (Sprint 27 contract — re-pinned here so the a11y suite
  // owns this assertion explicitly).
  describe('Sprint 29.7 — accessibility audit', () => {
    it('the drawer close button has a ≥44×44 touch target (h-11 w-11)', () => {
      renderFab();
      fireEvent.click(screen.getByTestId('assistant-fab'));
      const closeBtn = screen.getByTestId('assistant-fab-close');
      expect(closeBtn.className).toMatch(/\bh-11\b/);
      expect(closeBtn.className).toMatch(/\bw-11\b/);
    });

    it('the context-bar detach × has a ≥44×44 touch target (h-11 w-11)', () => {
      // detach × only renders when there's a clause selection; seed
      // one via openWith.
      scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
      const refs = renderFab({
        activeLease: {
          lease_id: 'l-1',
          filename: 'sample.pdf',
          page_count: 2,
          clause_count: 1,
          pdfUrl: 'blob:test',
        },
      });
      act(() => {
        refs.fab?.openWith({
          initialPrompt: 'Explain this clause',
          clauseId: 'c-1',
          severity: 'high',
          statuteCitation: 'NJ Stat 46:8-19',
        });
      });
      const detach = screen.getByTestId('assistant-context-bar-detach');
      expect(detach.className).toMatch(/\bh-11\b/);
      expect(detach.className).toMatch(/\bw-11\b/);
    });

    it('returns focus to the pill when the drawer closes (Sprint 27 contract)', () => {
      const refs = renderFab();
      const pill = screen.getByTestId('assistant-fab');
      // Open drawer → focus may move to the drawer/first focusable.
      fireEvent.click(pill);
      expect(refs.fab?.state).toBe('drawer');
      // Close drawer → focus returns to the pill (the affordance the
      // user opened from). This is the dialog/sheet pattern owed to
      // keyboard + SR users.
      act(() => {
        refs.fab?.close();
      });
      expect(refs.fab?.state).toBe('closed');
      expect(document.activeElement).toBe(pill);
    });
  });

  // Sprint 29.9 — Escape key really closes the drawer (real focus path).
  //
  // Playwright manual verification surfaced that the existing Sprint
  // 29.7 a11y test passed by accident: it dispatched the keydown
  // event directly on the drawer element (`fireEvent.keyDown(drawer)`),
  // which bypassed the actual focus path. In a real browser, after
  // the user clicks the FAB pill, focus stays on the pill — the
  // drawer's `onKeyDown` handler is a sibling-not-ancestor, so
  // Escape never reaches it. Drawer stays open.
  //
  // Fix: when state transitions closed → drawer, programmatically
  // focus the drawer container (it already has tabIndex={-1}). That
  // way the drawer IS in the bubble path for subsequent keystrokes,
  // and Tab order also follows the dialog pattern (next Tab goes to
  // the first focusable child of the drawer, not back out to body).
  describe('Sprint 29.9 — Escape closes the drawer via real focus path', () => {
    it('moves focus into the drawer container when it opens', () => {
      const refs = renderFab();
      fireEvent.click(screen.getByTestId('assistant-fab'));
      expect(refs.fab?.state).toBe('drawer');
      const drawer = screen.getByTestId('assistant-fab-drawer');
      expect(document.activeElement).toBe(drawer);
    });

    it('Escape pressed on the focused drawer container closes the drawer and returns focus to the pill', () => {
      const refs = renderFab();
      const pill = screen.getByTestId('assistant-fab');

      // Click pill → drawer opens → focus moves into drawer.
      fireEvent.click(pill);
      const drawer = screen.getByTestId('assistant-fab-drawer');
      expect(document.activeElement).toBe(drawer);

      // Escape on the focused drawer container — handler IS in the
      // bubble path now.
      fireEvent.keyDown(drawer, { key: 'Escape' });
      expect(refs.fab?.state).toBe('closed');
      expect(document.activeElement).toBe(pill);
    });

    it('also moves focus when openDrawer() is called programmatically (no click path)', () => {
      const refs = renderFab();
      act(() => {
        refs.fab?.openDrawer();
      });
      expect(refs.fab?.state).toBe('drawer');
      const drawer = screen.getByTestId('assistant-fab-drawer');
      expect(document.activeElement).toBe(drawer);
    });
  });
});
