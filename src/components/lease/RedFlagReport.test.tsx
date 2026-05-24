// Sprint 13 §3f / Phase 10.5 — right-pane red-flag stream.
// Cards are collapsed by default and reveal a "View on page N" inline
// action when expanded. The summary row above the cards aggregates
// counts per severity for at-a-glance scanability.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AssistantFabProvider,
  useAssistantFab,
} from '@/components/chat/AssistantFabContext';
import {
  ChatStreamProvider,
  type ToolEvent,
  useChatStream,
} from '@/components/chat/ChatStreamContext';
import { RedFlagReport } from './RedFlagReport';

afterEach(cleanup);

// Sprint 26c — RedFlagReport now consumes `useAssistantFab()` for its
// new Explain / Draft email actions. Every render must mount the
// AssistantFabProvider; the wrapper handles it once so existing tests
// stay readable.
function ProviderWithEvents({
  events,
  children,
}: {
  events: ToolEvent[];
  children: ReactNode;
}) {
  return (
    <AssistantFabProvider>
      <ChatStreamProvider initialEvents={events}>{children}</ChatStreamProvider>
    </AssistantFabProvider>
  );
}

const grade = (overrides: Partial<ToolEvent> = {}): ToolEvent => ({
  tool_name: 'grade_clause_severity',
  input: { clause_id: 'c1' },
  result: {
    clause_id: 'c1',
    severity: 'high',
    statute_citation: 'NJ Stat 46:8-21.2',
    chunk_id: 'security-deposit-cap#section:1',
    reasoning: 'Two months exceeds 1.5 cap.',
    recommended_action: 'Negotiate to 1.5 months.',
    page_number: 4,
    clause_type: 'security_deposit',
    clause_index: 3,
  },
  audit_id: undefined,
  ...overrides,
});

describe('RedFlagReport', () => {
  it('renders a placeholder when no grading events have arrived', () => {
    render(
      <ProviderWithEvents events={[]}>
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    expect(screen.getByTestId('red-flag-report-empty')).toBeInTheDocument();
  });

  it('renders one card per grade_clause_severity event', () => {
    render(
      <ProviderWithEvents
        events={[
          grade({
            input: { clause_id: 'c1' },
            result: {
              clause_id: 'c1',
              severity: 'high',
              statute_citation: 'NJ Stat 46:8-21.2',
              chunk_id: 'security-deposit-cap#section:1',
              reasoning: 'r1',
              recommended_action: 'a1',
              page_number: 1,
              clause_type: 'security_deposit',
              clause_index: 3,
            },
          }),
          grade({
            input: { clause_id: 'c2' },
            result: {
              clause_id: 'c2',
              severity: 'medium',
              statute_citation: 'NJ Stat 2A:42-6.1',
              chunk_id: 'late-fees-senior-citizens#section:0',
              reasoning: 'r2',
              recommended_action: 'a2',
              page_number: 3,
              clause_type: 'late_fee',
              clause_index: 4,
            },
          }),
        ]}
      >
        <RedFlagReport />
      </ProviderWithEvents>,
    );

    expect(screen.getAllByTestId('red-flag-card')).toHaveLength(2);
    // Citation surfaces in each card body.
    expect(screen.getByText(/NJ Stat 46:8-21\.2/)).toBeInTheDocument();
    expect(screen.getByText(/NJ Stat 2A:42-6\.1/)).toBeInTheDocument();
  });

  it('filters out non-grading tool events (extract_clauses, etc.)', () => {
    render(
      <ProviderWithEvents
        events={[
          {
            tool_name: 'extract_clauses',
            input: { lease_id: 'l1' },
            result: { clauses: [] },
            audit_id: undefined,
          },
        ]}
      >
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    expect(screen.queryByTestId('red-flag-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('red-flag-report-empty')).toBeInTheDocument();
  });

  it('renders severity-coded cards (data-severity attribute)', () => {
    render(
      <ProviderWithEvents events={[grade()]}>
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    const card = screen.getByTestId('red-flag-card');
    expect(card.getAttribute('data-severity')).toBe('high');
  });

  it('renders cards collapsed by default and expands on click', () => {
    render(
      <ProviderWithEvents events={[grade()]}>
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    const card = screen.getByTestId('red-flag-card');
    expect(card.getAttribute('data-expanded')).toBe('false');
    expect(screen.queryByTestId('red-flag-card-body')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('red-flag-card-toggle'));

    expect(card.getAttribute('data-expanded')).toBe('true');
    expect(screen.getByTestId('red-flag-card-body')).toBeInTheDocument();
    // Recommended action is only shown in the expanded body.
    expect(screen.getByText(/recommended action/i)).toBeInTheDocument();
    expect(screen.getByText(/negotiate to 1\.5 months/i)).toBeInTheDocument();
  });

  it('renders a summary row that counts cards per severity', () => {
    render(
      <ProviderWithEvents
        events={[
          grade({
            input: { clause_id: 'a' },
            result: {
              ...(grade().result as object),
              clause_id: 'a',
              severity: 'high',
            },
          }),
          grade({
            input: { clause_id: 'b' },
            result: {
              ...(grade().result as object),
              clause_id: 'b',
              severity: 'high',
            },
          }),
          grade({
            input: { clause_id: 'c' },
            result: {
              ...(grade().result as object),
              clause_id: 'c',
              severity: 'medium',
            },
          }),
          grade({
            input: { clause_id: 'd' },
            result: {
              ...(grade().result as object),
              clause_id: 'd',
              severity: 'ok',
            },
          }),
        ]}
      >
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    const summary = screen.getByTestId('red-flag-summary');
    // Compact "2 High · 1 Med · 1 OK" label. Counts + labels are
    // adjacent inline elements (visual gap is CSS, no text whitespace)
    // so collapse whitespace before matching.
    const normalised = summary.textContent?.replace(/\s+/g, '') ?? '';
    expect(normalised).toMatch(/2High.*1Med.*1OK/);
  });

  it('orders cards high → medium → low → ok', () => {
    render(
      <ProviderWithEvents
        events={[
          grade({
            input: { clause_id: 'a' },
            result: {
              ...(grade().result as object),
              clause_id: 'a',
              severity: 'ok',
              clause_index: 0,
            },
          }),
          grade({
            input: { clause_id: 'b' },
            result: {
              ...(grade().result as object),
              clause_id: 'b',
              severity: 'high',
              clause_index: 5,
            },
          }),
          grade({
            input: { clause_id: 'c' },
            result: {
              ...(grade().result as object),
              clause_id: 'c',
              severity: 'medium',
              clause_index: 2,
            },
          }),
        ]}
      >
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    const cards = screen.getAllByTestId('red-flag-card');
    expect(cards[0].getAttribute('data-severity')).toBe('high');
    expect(cards[1].getAttribute('data-severity')).toBe('medium');
    expect(cards[2].getAttribute('data-severity')).toBe('ok');
  });

  it('"View on page N" sets activeClauseId and applies an active ring to the matching card', () => {
    const scrollToPage = vi.fn();
    function Wired() {
      const { pdfViewerRef } = useChatStream();
      pdfViewerRef.current = { scrollToPage };
      return <RedFlagReport />;
    }
    render(
      <ProviderWithEvents events={[grade()]}>
        <Wired />
      </ProviderWithEvents>,
    );

    const card = screen.getByTestId('red-flag-card');
    // Default: no active state, no overlay ring rendered.
    expect(card.getAttribute('data-active')).toBe('false');
    expect(
      screen.queryByTestId('red-flag-active-ring'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('red-flag-card-toggle'));
    fireEvent.click(screen.getByTestId('red-flag-jump-to-page'));

    // Sprint 18 §4 — active state still flips on the card's data-active,
    // but the visual ring is now a separately-mounted overlay that fades
    // in/out via AnimatePresence (covered in detail in its own test).
    expect(card.getAttribute('data-active')).toBe('true');
    const overlay = screen.getByTestId('red-flag-active-ring');
    expect(overlay).toBeInTheDocument();
    expect(overlay.className).toMatch(/ring-2/);
    expect(overlay.className).toMatch(/ring-accent-300/);
  });

  it('"View on page N" inside the expanded body calls scrollToPage', () => {
    const scrollToPage = vi.fn();
    function Wired() {
      const { pdfViewerRef } = useChatStream();
      pdfViewerRef.current = { scrollToPage };
      return <RedFlagReport />;
    }
    const baseGrade = grade();
    const baseResult = baseGrade.result as Record<string, unknown>;
    render(
      <ProviderWithEvents
        events={[grade({ result: { ...baseResult, page_number: 7 } })]}
      >
        <Wired />
      </ProviderWithEvents>,
    );

    // Expand first.
    fireEvent.click(screen.getByTestId('red-flag-card-toggle'));
    fireEvent.click(screen.getByTestId('red-flag-jump-to-page'));
    expect(scrollToPage).toHaveBeenCalledWith(7);
  });

  // Sprint 18 §4 — citation chip in the always-visible header is now its
  // own button driving the same activeClauseId + scrollToPage flow.
  it('clicking the citation chip jumps to page and pulses the active ring without expanding the card', () => {
    const scrollToPage = vi.fn();
    function Wired() {
      const { pdfViewerRef } = useChatStream();
      pdfViewerRef.current = { scrollToPage };
      return <RedFlagReport />;
    }
    render(
      <ProviderWithEvents events={[grade()]}>
        <Wired />
      </ProviderWithEvents>,
    );

    const card = screen.getByTestId('red-flag-card');
    expect(card.getAttribute('data-expanded')).toBe('false');
    expect(card.getAttribute('data-active')).toBe('false');

    // The citation row hosts the CitationChip; click the chip's button.
    const chip = screen.getByRole('button', { name: /NJ Stat 46:8-21\.2/i });
    fireEvent.click(chip);

    // PDF scroll fires, ring overlay mounts, AND the card stays collapsed
    // (because the chip is now a sibling of the expand toggle).
    expect(scrollToPage).toHaveBeenCalledWith(4);
    expect(card.getAttribute('data-active')).toBe('true');
    expect(card.getAttribute('data-expanded')).toBe('false');
    expect(screen.getByTestId('red-flag-active-ring')).toBeInTheDocument();
  });

  it('renders the citation as a non-interactive span when the clause has no page_number', () => {
    const baseGrade = grade();
    const baseResult = baseGrade.result as Record<string, unknown>;
    const { page_number: _ignored, ...withoutPage } = baseResult;
    render(
      <ProviderWithEvents events={[grade({ result: withoutPage })]}>
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    // Citation row still renders, but contains a span (not a button)
    // because there's no page to jump to.
    const row = screen.getByTestId('red-flag-citation-row');
    expect(row).toBeInTheDocument();
    expect(row.querySelector('button[data-testid="citation-chip"]')).toBeNull();
    expect(
      row.querySelector('span[data-testid="citation-chip"]'),
    ).toBeInTheDocument();
  });

  it('latest grading per clause wins (re-runs replace prior result)', () => {
    const earlierResult = {
      clause_id: 'c1',
      severity: 'medium' as const,
      statute_citation: 'NJ Stat A',
      chunk_id: 'x#section:0',
      reasoning: 'old',
      recommended_action: 'old',
      page_number: 1,
      clause_type: 'security_deposit',
      clause_index: 0,
    };
    const laterResult = { ...earlierResult, severity: 'high' as const };
    render(
      <ProviderWithEvents
        events={[
          { ...grade(), result: earlierResult },
          { ...grade(), result: laterResult },
        ]}
      >
        <RedFlagReport />
      </ProviderWithEvents>,
    );
    const cards = screen.getAllByTestId('red-flag-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('data-severity')).toBe('high');
  });

  // Sprint 18 §2 — scanning state branches.
  describe('scanning state', () => {
    const extractEvent = (clauseIds: string[]): ToolEvent => ({
      tool_name: 'extract_clauses',
      input: { lease_id: 'l1' },
      result: { clauses: clauseIds.map((id) => ({ clause_id: id })) },
      audit_id: undefined,
    });

    it('renders the 6-stage lifecycle panel when extract has landed but no gradings yet', () => {
      // Sprint 27 — the bare skeleton stack is replaced with the
      // RedFlagsLoadingState panel so the user sees what the parser
      // is doing (Jakob Nielsen: visibility of system status). The
      // active stage in this state is "extracting clauses" with
      // a live count of 3 found.
      render(
        <ProviderWithEvents events={[extractEvent(['c1', 'c2', 'c3'])]}>
          <RedFlagReport />
        </ProviderWithEvents>,
      );
      // No empty-state examples while a scan is mid-flight.
      expect(
        screen.queryByTestId('red-flag-report-empty-examples'),
      ).not.toBeInTheDocument();
      const list = screen.getByTestId('red-flag-lifecycle');
      const rows = within(list).getAllByRole('listitem');
      expect(rows).toHaveLength(6);
      // The "extracting_clauses" row should be active.
      const extractingRow = rows.find(
        (r) => r.getAttribute('data-stage') === 'extracting_clauses',
      );
      expect(extractingRow).toBeDefined();
      expect(extractingRow).toHaveAttribute('data-status', 'active');
      // Live count surfaces as detail subtext.
      expect(extractingRow?.textContent).toMatch(/3/);
    });

    it('renders real cards plus trailing skeletons for ungraded clauses', () => {
      render(
        <ProviderWithEvents
          events={[
            extractEvent(['c1', 'c2', 'c3']),
            grade({
              input: { clause_id: 'c1' },
              result: {
                ...(grade().result as object),
                clause_id: 'c1',
                severity: 'high',
              },
            }),
          ]}
        >
          <RedFlagReport />
        </ProviderWithEvents>,
      );
      expect(screen.getAllByTestId('red-flag-card')).toHaveLength(1);
      expect(screen.getAllByTestId('red-flag-skeleton-card')).toHaveLength(2);
    });

    it('drops all skeletons once every clause has been graded', () => {
      render(
        <ProviderWithEvents
          events={[
            extractEvent(['c1', 'c2']),
            grade({
              input: { clause_id: 'c1' },
              result: {
                ...(grade().result as object),
                clause_id: 'c1',
                severity: 'high',
              },
            }),
            grade({
              input: { clause_id: 'c2' },
              result: {
                ...(grade().result as object),
                clause_id: 'c2',
                severity: 'medium',
              },
            }),
          ]}
        >
          <RedFlagReport />
        </ProviderWithEvents>,
      );
      expect(screen.getAllByTestId('red-flag-card')).toHaveLength(2);
      expect(
        screen.queryByTestId('red-flag-skeleton-card'),
      ).not.toBeInTheDocument();
    });

    it('drops skeletons when every clause has a tool_result, even if some errored', () => {
      // Regression: a real scan returning 1 success + 2 errors across
      // 3 clauses used to leave 2 ghost skeletons because the hook only
      // counted successful gradings. Now we count attempts (success +
      // error), so the rail clears as soon as the scan is truly done.
      const erroredGrade = (clauseId: string): ToolEvent => ({
        tool_name: 'grade_clause_severity',
        input: { clause_id: clauseId },
        result: { error: 'corpus lookup failed' },
        audit_id: undefined,
      });
      render(
        <ProviderWithEvents
          events={[
            extractEvent(['c1', 'c2', 'c3']),
            grade({
              input: { clause_id: 'c1' },
              result: {
                ...(grade().result as object),
                clause_id: 'c1',
                severity: 'high',
              },
            }),
            erroredGrade('c2'),
            erroredGrade('c3'),
          ]}
        >
          <RedFlagReport />
        </ProviderWithEvents>,
      );
      expect(screen.getAllByTestId('red-flag-card')).toHaveLength(1);
      expect(
        screen.queryByTestId('red-flag-skeleton-card'),
      ).not.toBeInTheDocument();
    });
  });

  // Sprint 23d Phase 2 — cards + summary consume the new SeverityBadge
  // primitive instead of inline pill spans / dot-text pairs. Triple-
  // channel severity (icon + text + colour) closes the handoff §19
  // accessibility gap.
  describe('Sprint 23d — SeverityBadge consumption', () => {
    it('each red-flag card renders a SeverityBadge in its header', () => {
      render(
        <ProviderWithEvents events={[grade()]}>
          <RedFlagReport />
        </ProviderWithEvents>,
      );
      const card = screen.getByTestId('red-flag-card');
      const badge = card.querySelector('[data-testid="severity-badge"]');
      expect(badge, 'card should render a SeverityBadge').not.toBeNull();
      expect(badge?.getAttribute('data-severity')).toBe('high');
      // The badge contains an SVG icon (not a plain coloured pill).
      expect(badge?.querySelector('svg')).not.toBeNull();
    });

    it('summary row renders one SeverityBadge per non-zero severity', () => {
      render(
        <ProviderWithEvents
          events={[
            grade({
              input: { clause_id: 'a' },
              result: {
                ...(grade().result as object),
                clause_id: 'a',
                severity: 'high',
              },
            }),
            grade({
              input: { clause_id: 'b' },
              result: {
                ...(grade().result as object),
                clause_id: 'b',
                severity: 'medium',
              },
            }),
          ]}
        >
          <RedFlagReport />
        </ProviderWithEvents>,
      );
      const summary = screen.getByTestId('red-flag-summary');
      const badges = summary.querySelectorAll('[data-testid="severity-badge"]');
      // Two non-zero severities → 2 badges.
      expect(badges.length).toBe(2);
      // sm size — verified via the 10px utility (or text-xs canonical).
      for (const badge of badges) {
        expect(badge.className).toMatch(/text-\[10px\]|text-xs/);
      }
    });
  });

  // Sprint 23d Phase 4 — empty-state example preview card.
  describe('Sprint 23d — empty-state example preview', () => {
    it('renders an example preview card before any gradings exist', () => {
      render(
        <ProviderWithEvents events={[]}>
          <RedFlagReport />
        </ProviderWithEvents>,
      );
      // The empty branch carries an example-preview testid above the
      // existing bulleted examples list.
      expect(screen.getByTestId('red-flag-empty-preview')).toBeInTheDocument();
      // The preview contains a SeverityBadge (proving it uses the real
      // card pattern, not a separate visual language).
      const preview = screen.getByTestId('red-flag-empty-preview');
      expect(
        preview.querySelector('[data-testid="severity-badge"]'),
      ).not.toBeNull();
    });

    it('preview is visually muted (low opacity) and carries an "Example" eyebrow', () => {
      render(
        <ProviderWithEvents events={[]}>
          <RedFlagReport />
        </ProviderWithEvents>,
      );
      const preview = screen.getByTestId('red-flag-empty-preview');
      // Low-opacity treatment — opacity-60, opacity-70, or similar so
      // the example reads as decorative rather than active data.
      expect(preview.className).toMatch(/\bopacity-(60|65|70)\b/);
      // "Example" eyebrow sits inside the preview container.
      expect(preview.textContent ?? '').toMatch(/example/i);
    });
  });

  // Sprint 26c — Explain + Draft email actions open the FAB drawer
  // with a prefilled, clause-aware prompt. Defined at the bottom so
  // the vi.mock + AssistantFabProvider stays out of the older tests'
  // way.
});

// ===========================================================================
// Sprint 26c — RedFlagReport + AssistantFabContext integration
// ===========================================================================
//
// We import AssistantFabProvider/useAssistantFab from the real module and
// wrap the rendered tree in BOTH providers (ChatStream + Fab). A small
// Probe captures the FAB context handle so the test can read state and
// assert that openWith was called with the right payload. The imports
// already exist at the top of the file.

describe('Sprint 26c — RedFlagReport card actions wire into AssistantFabContext', () => {
  afterEach(cleanup);

  function renderWithFab(events: ToolEvent[]): {
    fab: ReturnType<typeof useAssistantFab> | null;
  } {
    const ref: { fab: ReturnType<typeof useAssistantFab> | null } = {
      fab: null,
    };
    function Probe(): null {
      ref.fab = useAssistantFab();
      return null;
    }
    render(
      <AssistantFabProvider>
        <ChatStreamProvider initialEvents={events}>
          <Probe />
          <RedFlagReport />
        </ChatStreamProvider>
      </AssistantFabProvider>,
    );
    return ref;
  }

  it('renders an Explain button inside the expanded card that opens the FAB drawer with clause context', () => {
    const ctx = renderWithFab([grade()]);
    fireEvent.click(screen.getByTestId('red-flag-card-toggle'));
    const explain = screen.getByTestId('red-flag-explain');
    expect(explain.tagName).toBe('BUTTON');
    expect(explain).toHaveAttribute('type', 'button');
    fireEvent.click(explain);

    expect(ctx.fab?.state).toBe('drawer');
    expect(ctx.fab?.selection.clauseId).toBe('c1');
    expect(ctx.fab?.selection.severity).toBe('high');
    expect(ctx.fab?.selection.statuteCitation).toBe('NJ Stat 46:8-21.2');
    expect(ctx.fab?.pendingPrompt?.toLowerCase()).toContain('explain');
  });

  it('renders a Draft email button inside the expanded card that opens the FAB drawer with a draft prompt', () => {
    const ctx = renderWithFab([grade()]);
    fireEvent.click(screen.getByTestId('red-flag-card-toggle'));
    const draft = screen.getByTestId('red-flag-draft-email');
    expect(draft.tagName).toBe('BUTTON');
    fireEvent.click(draft);

    expect(ctx.fab?.state).toBe('drawer');
    expect(ctx.fab?.selection.clauseId).toBe('c1');
    expect(ctx.fab?.pendingPrompt?.toLowerCase()).toContain('draft');
    expect(ctx.fab?.pendingPrompt?.toLowerCase()).toContain('email');
  });
});
