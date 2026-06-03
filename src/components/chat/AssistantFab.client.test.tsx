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
    // are now passed to ChatUI as `suggestedPrompts`.
    // Sprint 33.A — chip set is scan-agnostic Q&A. Seed review_ready +
    // an activeLease + one grading event so the gating chips
    // ('explain-top-finding' etc.) read as enabled.
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    renderFab({
      activeLease: {
        lease_id: 'l-ready',
        filename: 'ready.pdf',
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
    const suggestions = screen.getAllByTestId('chat-ui-mock-suggestion');
    expect(suggestions).toHaveLength(4);
    const explainChip = suggestions.find(
      (s) => s.getAttribute('data-suggestion-id') === 'explain-top-finding',
    );
    expect(explainChip).toBeDefined();
    expect(explainChip).not.toBeDisabled();
  });

  it("clicking an in-drawer suggestion chip seeds the composer with that chip's prompt", () => {
    // Sprint 27.1 — equivalent to the old "chip opens drawer with
    // prefill" test, but the chip now lives inside the open drawer.
    // Sprint 33.A — chip set is scan-agnostic Q&A; we exercise the
    // 'compare-to-nj-law' chip whose prompt mentions NJ law verbatim.
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    renderFab({
      activeLease: {
        lease_id: 'l-ready',
        filename: 'ready.pdf',
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
    const compareChip = screen
      .getAllByTestId('chat-ui-mock-suggestion')
      .find(
        (s) => s.getAttribute('data-suggestion-id') === 'compare-to-nj-law',
      );
    if (!compareChip) throw new Error('expected compare-to-nj-law chip');
    fireEvent.click(compareChip);
    expect(screen.getByTestId('assistant-fab-drawer')).toBeInTheDocument();
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toMatch(/nj law|search_corpus/i);
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

  it('disables the Q&A chips when no gradings have streamed yet (Sprint 33.A)', () => {
    // Sprint 27.1 set the original "chip gating" pattern. Sprint 33.A's
    // chip set is gated on hasGradings (any grade_clause_severity event
    // in toolEvents) rather than on hasActiveClause. We seed an active
    // lease with NO grading events and assert the three findings-
    // dependent chips read as disabled. The fourth Q&A chip in this set
    // (`compare-to-nj-law`) is intentionally also gated on hasGradings —
    // its prompt references "the highest-severity finding" which doesn't
    // exist before any grading lands.
    scanLifecycleMock.mockReturnValue(MID_SCAN_SNAPSHOT);
    renderFab({
      activeLease: {
        lease_id: 'l-1',
        filename: 'sample.pdf',
        page_count: 2,
        clause_count: 1,
        pdfUrl: 'blob:test',
      },
      // No grading events → hasGradings === false → all Q&A chips disabled.
    });
    fireEvent.click(screen.getByTestId('assistant-fab'));
    const chips = screen.getAllByTestId('chat-ui-mock-suggestion');
    for (const chip of chips) {
      expect(chip).toBeDisabled();
    }
  });

  // Sprint 33.A — chip set is now a binary choice (onboarding vs Q&A),
  // not a three-way lifecycle-driven split. Supersedes Sprint 29.4's
  // mid-scan + review-ready distinction.
  //
  //   - no lease     → onboarding chips ("how does LeaseLens work?" …)
  //   - lease active (any stage) → scan-agnostic Q&A set:
  //       explain-top-finding / draft-biggest-concern-email /
  //       compare-to-nj-law / what-to-fix-first
  //
  // Rationale: the chat is no longer narrating the scan (the right
  // pane owns that). The chip set is therefore the same whether the
  // scan is mid-flight or complete — they're all Q&A-shaped.
  describe('Sprint 33.A — scan-agnostic Q&A chip set', () => {
    function suggestionIds(): string[] {
      return screen
        .getAllByTestId('chat-ui-mock-suggestion')
        .map((s) => s.getAttribute('data-suggestion-id') ?? '');
    }
    function subhead(): string {
      return (
        screen
          .getByTestId('chat-ui-mock')
          .getAttribute('data-empty-state-subhead') ?? ''
      );
    }

    it('renders the onboarding chip set when there is no lease (unchanged)', () => {
      renderFab();
      fireEvent.click(screen.getByTestId('assistant-fab'));
      expect(suggestionIds()).toEqual([
        'how-it-works',
        'what-it-checks',
        'after-upload',
      ]);
    });

    it('renders the scan-agnostic Q&A chip set when a lease is active mid-scan', () => {
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
      expect(suggestionIds()).toEqual([
        'explain-top-finding',
        'draft-biggest-concern-email',
        'compare-to-nj-law',
        'what-to-fix-first',
      ]);
    });

    it('renders the same Q&A chip set once the scan reaches review_ready', () => {
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
      expect(suggestionIds()).toEqual([
        'explain-top-finding',
        'draft-biggest-concern-email',
        'compare-to-nj-law',
        'what-to-fix-first',
      ]);
    });

    it('no lease → "No lease attached yet…" subhead is passed to ChatUI', () => {
      renderFab();
      fireEvent.click(screen.getByTestId('assistant-fab'));
      expect(subhead()).toMatch(/no lease attached yet/i);
    });

    it('lease active → "Ask about any clause, citation, finding…" subhead', () => {
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
      expect(subhead()).toMatch(
        /ask about any (clause|finding|citation)|ask about a clause/i,
      );
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

describe('Sprint 36 — context-sized display modes', () => {
  const ACTIVE_LEASE = {
    lease_id: 'L1',
    filename: 'sample.pdf',
    clause_count: 15,
  };

  function openDrawer(refs: ReturnType<typeof renderFab>): HTMLElement {
    act(() => {
      refs.fab?.openDrawer();
    });
    return screen.getByTestId('assistant-fab-drawer');
  }

  it('no lease → opens in compact-help mode (small panel)', () => {
    const refs = renderFab(); // default IDLE, no lease
    const drawer = openDrawer(refs);
    expect(drawer.getAttribute('data-display-mode')).toBe('compact-help');
    expect(drawer.className).toContain('w-[min(420px,calc(100vw-3rem))]');
    expect(drawer.className).toContain('h-[min(480px,70vh)]');
  });

  it('lease attached → opens in workspace-drawer mode at the existing size (no regression)', () => {
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    const refs = renderFab({ activeLease: ACTIVE_LEASE });
    const drawer = openDrawer(refs);
    expect(drawer.getAttribute('data-display-mode')).toBe('workspace-drawer');
    expect(drawer.className).toContain('w-[min(560px,calc(100vw-3rem))]');
    expect(drawer.className).toContain('lg:w-[min(620px,calc(100vw-3rem))]');
    expect(drawer.className).toContain('h-[min(720px,80vh)]');
  });

  it('clicking Expand grows the drawer into expanded-reading mode', () => {
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    const refs = renderFab({ activeLease: ACTIVE_LEASE });
    const drawer = openDrawer(refs);
    fireEvent.click(screen.getByTestId('assistant-fab-expand'));
    expect(drawer.getAttribute('data-display-mode')).toBe('expanded-reading');
    expect(drawer.className).toContain('w-[min(720px,calc(100vw-3rem))]');
    expect(drawer.className).toContain('lg:w-[min(820px,calc(100vw-3rem))]');
    // Sprint 36.1 — height is bounded by the space above the bottom-28 anchor
    // (7rem) + a 2rem top inset, NOT a raw 92vh. A 92vh panel anchored 112px
    // off the bottom pushes its header (Collapse/Close) above the viewport on
    // any screen shorter than ~1400px, trapping the user in expanded mode.
    expect(drawer.className).toContain('h-[min(900px,calc(100vh-9rem))]');
    expect(drawer.className).not.toContain('h-[min(900px,92vh)]');
  });

  it('expanding does NOT reset the composer draft / prefill', () => {
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    const refs = renderFab({ activeLease: ACTIVE_LEASE });
    act(() => {
      refs.fab?.openWith({ initialPrompt: 'Seed clause question' });
    });
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('Seed clause question');
    fireEvent.click(screen.getByTestId('assistant-fab-expand'));
    // Same ChatUI instance, prefill untouched by the size toggle.
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('Seed clause question');
    expect(refs.fab?.selection.clauseId ?? null).toBe(null);
  });

  it('no lease → the Expand button is not rendered (compact-help has nothing to expand)', () => {
    const refs = renderFab();
    openDrawer(refs);
    expect(
      screen.queryByTestId('assistant-fab-expand'),
    ).not.toBeInTheDocument();
  });

  it('Expand button is a ≥44px toggle with an accessible name + aria-pressed', () => {
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    const refs = renderFab({ activeLease: ACTIVE_LEASE });
    openDrawer(refs);
    const expand = screen.getByTestId('assistant-fab-expand');
    expect(expand.className).toContain('h-11');
    expect(expand.className).toContain('w-11');
    expect(expand.getAttribute('aria-label') ?? '').toMatch(/expand|collapse/i);
    expect(expand.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(expand);
    expect(expand.getAttribute('aria-pressed')).toBe('true');
  });

  it('focus returns to the pill after expanding then closing; reopening is workspace size again', () => {
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    const refs = renderFab({ activeLease: ACTIVE_LEASE });
    const pill = screen.getByTestId('assistant-fab');
    fireEvent.click(pill); // open via click so focus path is real
    fireEvent.click(screen.getByTestId('assistant-fab-expand'));
    act(() => {
      refs.fab?.close();
    });
    expect(refs.fab?.state).toBe('closed');
    expect(document.activeElement).toBe(pill);
    // Reopen: expanded was reset on close, so we're back to workspace size.
    fireEvent.click(pill);
    expect(
      screen
        .getByTestId('assistant-fab-drawer')
        .getAttribute('data-display-mode'),
    ).toBe('workspace-drawer');
  });

  it('Escape still closes the drawer after expanding', () => {
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    const refs = renderFab({ activeLease: ACTIVE_LEASE });
    const drawer = openDrawer(refs);
    fireEvent.click(screen.getByTestId('assistant-fab-expand'));
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(refs.fab?.state).toBe('closed');
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries a mobile-safe size class so small viewports never overflow', () => {
    const refs = renderFab();
    const drawer = openDrawer(refs);
    expect(drawer.className).toContain('max-sm:w-[calc(100vw-2rem)]');
    expect(drawer.className).toContain('max-sm:h-[min(85vh,calc(100vh-7rem))]');
  });

  it('uses the lighter hairline border + soft shadow instead of the heavy border (Refactoring UI / Rams)', () => {
    const refs = renderFab();
    const drawer = openDrawer(refs);
    // Lighter: hairline-token border (auto-flips dark) + soft shadow-lg.
    expect(drawer.className).toContain('border-border-hairline');
    expect(drawer.className).toContain('shadow-lg');
    // Heavier old treatment gone.
    expect(drawer.className).not.toContain('border border-neutral-200');
    expect(drawer.className).not.toContain('shadow-xl');
  });
});

describe('Sprint 36.2 — drawer header typography', () => {
  const LEASE = { lease_id: 'L1', filename: 'sample.pdf', clause_count: 15 };

  it('titles the panel in the editorial serif with an italic emphasis word', () => {
    const refs = renderFab();
    act(() => {
      refs.fab?.openDrawer();
    });
    const h2 = screen.getByRole('heading', { name: /leaselens assistant/i });
    // Brand editorial register (Source Serif 4), not the prototype sans label.
    expect(h2.className).toContain('font-serif');
    expect(h2.className).toContain('font-bold');
    expect(h2.className).not.toContain('text-[13px]');
    // "assistant" is the italic emphasis word (the brand's one-italic signature).
    const emphasis = h2.querySelector('.italic');
    expect(emphasis?.textContent?.trim()).toBe('assistant');
  });

  it('renders the lease filename as a mono identifier in the Using bar, with muted metadata', () => {
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    const refs = renderFab({ activeLease: LEASE });
    act(() => {
      refs.fab?.openDrawer();
    });
    const bar = screen.getByTestId('assistant-context-bar');
    // Filename is a technical identifier → Geist Mono (MASTER.md).
    const mono = bar.querySelector('.font-mono');
    expect(mono?.textContent).toContain('sample.pdf');
    // Visible text unchanged: metric + status still present (just muted).
    expect(bar.textContent).toContain('15 clauses');
    expect(bar.textContent).toContain('Scan complete');
  });

  it('keeps the "No lease attached" Using copy when no lease is present', () => {
    const refs = renderFab();
    act(() => {
      refs.fab?.openDrawer();
    });
    const bar = screen.getByTestId('assistant-context-bar');
    expect(bar.textContent).toContain('No lease attached');
    // No mono filename token when there's no file.
    expect(bar.querySelector('.font-mono')).toBeNull();
  });
});

describe('Sprint 36.3 — USING metadata (tabular count + status dot)', () => {
  const LEASE = { lease_id: 'L1', filename: 'sample.pdf', clause_count: 15 };

  it('renders the clause count with tabular-nums (a designed metric, not flat text)', () => {
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    const refs = renderFab({ activeLease: LEASE });
    act(() => {
      refs.fab?.openDrawer();
    });
    const bar = screen.getByTestId('assistant-context-bar');
    const tabular = bar.querySelector('.tabular-nums');
    expect(tabular?.textContent).toContain('15 clauses');
  });

  it('renders an animated radar status dot (nav LIVE style), success-tinted, before the status', () => {
    scanLifecycleMock.mockReturnValue(REVIEW_READY_SNAPSHOT);
    const refs = renderFab({ activeLease: LEASE });
    act(() => {
      refs.fab?.openDrawer();
    });
    const bar = screen.getByTestId('assistant-context-bar');
    const dot = bar.querySelector('[data-testid="assistant-using-status-dot"]');
    expect(dot).not.toBeNull();
    // Text carries the meaning; the dot is decorative reinforcement (colour +
    // motion never the only signal).
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    // Two-layer radar ping like the masthead LIVE indicator, reduced-motion gated.
    expect(dot?.innerHTML).toContain('motion-safe:animate-ping');
    expect(dot?.innerHTML).toContain('bg-success-600'); // complete → success tone
    expect(bar.textContent).toContain('Scan complete');
    // The middle-dot separator after "clauses" is gone — the status now sits on
    // its own, set apart by spacing, not another "·".
    expect(bar.textContent).not.toContain('clauses · Scan');
  });
});

describe('Sprint 36.4 — drawer open/close + resize motion', () => {
  const LEASE = { lease_id: 'L1', filename: 'sample.pdf', clause_count: 15 };

  it('animates with a fade + scale instead of an instant display toggle', () => {
    const refs = renderFab();
    act(() => {
      refs.fab?.openDrawer();
    });
    const drawer = screen.getByTestId('assistant-fab-drawer');
    // Transition covers fade (opacity), open/close (scale) AND the expand
    // resize (width/height); scales from the pill corner; reduced-motion off.
    expect(drawer.className).toContain(
      'transition-[opacity,scale,width,height]',
    );
    expect(drawer.className).toContain('origin-bottom-right');
    expect(drawer.className).toContain('motion-reduce:transition-none');
    // First-mount enter (the drawer mounts straight into the open state, so it
    // needs a @starting-style value to ease out of).
    expect(drawer.className).toContain('starting:opacity-0');
    // Open = settled.
    expect(drawer.className).toContain('opacity-100');
    expect(drawer.className).toContain('scale-100');
    // No longer an instant display:none pop.
    expect(drawer.className).not.toContain('pointer-events-none hidden');
  });

  it('eases OUT on close (opacity-0 + scale-95 + pointer-events-none), not display:none', () => {
    const refs = renderFab({ activeLease: LEASE });
    act(() => {
      refs.fab?.openDrawer();
    });
    act(() => {
      refs.fab?.close();
    });
    const drawer = screen.getByTestId('assistant-fab-drawer');
    expect(drawer.className).toContain('opacity-0');
    expect(drawer.className).toContain('scale-95');
    expect(drawer.className).toContain('pointer-events-none');
    // The bare display:none `hidden` is gone (it killed the exit transition);
    // `overflow-hidden` legitimately remains, so match the standalone token.
    expect(drawer.className).not.toMatch(/(?:^|\s)hidden(?:\s|$)/);
    // Behaviour unchanged: still aria-hidden + mounted (draft survives).
    expect(drawer).toHaveAttribute('aria-hidden', 'true');
  });
});
