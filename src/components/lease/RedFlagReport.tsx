// Sprint 13 §3f / Phase 10.5 — right-pane red-flag stream.
//
// Reads tool events from ChatStreamContext and renders one card per
// grade_clause_severity result. Cards are collapsible (header always
// visible, body expands on click); a tiny "View on page N" inline
// action calls pdfViewerRef.current.scrollToPage so the user can jump
// to the cited clause without leaving the chat. Wathan/Schoger styling:
// soft white card, severity-only-coded left bar (no full-card tinting),
// strong title-row hierarchy, low-contrast body text, comfortable
// spacing in a 320px column.
//
// Sprint 15 Phase 8 — items slide in from the right with an 8px offset
// (spring), exit cleanly via AnimatePresence on lease swap, panel
// summary header pulses once when count grows. Severity bars and
// badges move to semantic tokens (danger/warning/info/success).

'use client';

import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Languages,
  Mail,
  Paperclip,
} from 'lucide-react';
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAssistantFab } from '@/components/chat/AssistantFabContext';
import { EmptyState } from '@/components/states/EmptyState';
import { SPRING_GENTLE } from '@/lib/motion/presets';
import { CitationChip } from './CitationChip';
import {
  clauseLabel,
  type GradingResult,
  isGradingResult,
  SEVERITY_BAR,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  type Severity,
} from './grading';
import { useLeaseParser } from './LeaseParserContext';
import { useHighlightSettings } from './PdfHighlightContext';
import { RedFlagSkeletonCard } from './RedFlagSkeletonCard';
import { RedFlagsLoadingState } from './RedFlagsLoadingState';
import { SEVERITY_ICON, SeverityBadge } from './SeverityBadge';
import { useScanLifecycle } from './scan-lifecycle';
import {
  shouldEmphasizeVerdict,
  VERDICT_SETTLE_TRANSITION,
} from './verdict-emphasis';

// Sprint 26c — prompt templates for the FAB drawer. Centralized so the
// copy stays consistent and a single test pins the wording.
export function explainPromptFor(g: GradingResult): string {
  const label = clauseLabel(g);
  const severityWord = SEVERITY_LABEL[g.severity].toLowerCase();
  return `Explain the ${severityWord} concern with ${label}. Reference ${g.statute_citation} verbatim and walk me through what the statute says.`;
}

export function draftEmailPromptFor(g: GradingResult): string {
  const label = clauseLabel(g);
  return `Draft a polite negotiation email to the landlord about ${label}. Cite ${g.statute_citation} and propose a specific edit.`;
}

// Sprint 35 — plain-English explanation, the tenant-facing sibling of
// explainPromptFor (which is a statute-verbatim walkthrough). The grounding
// contract is load-bearing: keep the verbatim ${statute_citation} and instruct
// the model to simplify the LANGUAGE, never to change or soften what the law
// requires. A sibling test pins this wording so the source-grounding can't drift.
export function plainEnglishPromptFor(g: GradingResult): string {
  const label = clauseLabel(g);
  const severityWord = SEVERITY_LABEL[g.severity].toLowerCase();
  return `Explain the ${severityWord} concern with ${label} in plain English, without legal jargon, as if to a tenant with no legal background. Stay grounded in ${g.statute_citation}: do not change or soften what the law actually requires — just make the meaning easy to understand. Tell me in everyday terms what this means for me as a tenant and what I can do about it.`;
}

import { computeScanVerdict } from '@/lib/lease/scan-verdict';
import { partitionByLatestExtract, useScanProgress } from './use-scan-progress';

// Phase 10.8 — how long the page-level highlight + active-card ring
// stay on screen after "View on page N" is clicked. Long enough to
// orient (and to read the sticky callout), short enough to fade
// before the next interaction.
const HIGHLIGHT_DURATION_MS = 4000;

// Sprint 50.2 — verdict tier → severity colour variable. The verdict halo +
// glyph reuse the SAME semantic tokens as the card bar/badge (grading.ts
// SEVERITY_BAR), so the "is this lease bad?" headline speaks the identical
// severity language as the cards it summarises. Colour is reinforcement only;
// the headline words + the glyph (SEVERITY_ICON) carry the meaning (WCAG).
const VERDICT_TIER_VAR: Record<Severity, string> = {
  high: 'var(--color-danger-600)',
  medium: 'var(--color-warning-600)',
  low: 'var(--color-info-600)',
  ok: 'var(--color-success-600)',
};

export function RedFlagReport(): React.JSX.Element {
  const {
    toolEvents,
    pdfViewerRef,
    activeClauseId,
    setActiveClauseId,
    activeLease,
  } = useLeaseParser();
  // Sprint 26c — FAB context is available wherever the parser shells
  // mount. RedFlagReport is currently used only inside those shells
  // (and inside Vitest tests that mount both providers), so this is
  // always defined in practice.
  const fab = useAssistantFab();
  // Sprint 46.6 — the card↔PDF hover bridge. hoveredClauseId is the
  // transient, symmetric channel (distinct from the sticky activeClauseId
  // click-focus): hovering a card emphasizes its PDF highlight and vice
  // versa, without scrolling or clipping the 4s active ring.
  const { hoveredClauseId, setHoveredClauseId } = useHighlightSettings();
  const scan = useScanProgress();
  const lifecycle = useScanLifecycle();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Sprint 51 — the OK ("looks standard") clauses roll up into a single
  // collapsed line by default so the rail leads with the risks, not a tail of
  // compliant clauses (Steve Krug: don't make the tenant scan past N identical
  // "OK" cards). Expanding reveals them in place.
  const [okExpanded, setOkExpanded] = useState(false);
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const animate = mounted && !reduced;

  // Sprint 26c.9 — lease-aware grading filter. Only count clause_ids
  // that belong to the active lease's most recent extract. Without
  // this filter, rehydrated tool events from a prior conversation's
  // lease surfaced as stale cards on a freshly uploaded lease.
  const gradings = useMemo(() => {
    const activeLeaseId = activeLease?.lease_id ?? null;
    const { extract } = partitionByLatestExtract(toolEvents, activeLeaseId);
    const allowedClauseIds = extract
      ? new Set(extract.clauses.map((c) => c.clause_id))
      : null;

    const byClauseId = new Map<string, GradingResult>();
    for (const event of toolEvents) {
      if (event.tool_name !== 'grade_clause_severity') continue;
      if (!isGradingResult(event.result)) continue;
      // When we have an extract for the active lease, drop any grading
      // for a clause_id that's not part of that lease's clause set.
      // When we don't (no extract yet, or no active lease), fall back
      // to the legacy behavior of accepting any grading — this
      // preserves the seeded-conversation test fixture flow that
      // carries gradings without an extract.
      if (allowedClauseIds && !allowedClauseIds.has(event.result.clause_id)) {
        continue;
      }
      byClauseId.set(event.result.clause_id, event.result);
    }
    return Array.from(byClauseId.values()).sort((a, b) => {
      const sevDelta =
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
      if (sevDelta !== 0) return sevDelta;
      return (a.clause_index ?? 0) - (b.clause_index ?? 0);
    });
  }, [toolEvents, activeLease?.lease_id]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { high: 0, medium: 0, low: 0, ok: 0 };
    for (const g of gradings) c[g.severity] += 1;
    return c;
  }, [gradings]);

  // Sprint 33.B — synthesized verdict headline + ungraded count.
  //
  // The headline answers "is this lease bad and what should I worry
  // about first" — a question the count strip can't. Computed
  // deterministically by computeScanVerdict from the same gradings
  // the cards render, so the headline can never disagree with the
  // cards (unlike the model-authored chat table this replaces).
  //
  // The ungraded count surfaces clauses whose grade_clause_severity
  // tool errored (e.g. citation grounding rejected). Without this,
  // the count strip silently undersells the scan ("9 OK" hides "4
  // clauses we couldn't speak to"). [Jakob Nielsen visibility +
  // Don Norman recovery: every absence the user might notice gets
  // a label and a path to learn more.]
  const ungradedCount = useMemo(() => {
    const activeLeaseId = activeLease?.lease_id ?? null;
    const { extract } = partitionByLatestExtract(toolEvents, activeLeaseId);
    const allowedClauseIds = extract
      ? new Set(extract.clauses.map((c) => c.clause_id))
      : null;
    const seen = new Set<string>();
    let count = 0;
    for (const event of toolEvents) {
      if (event.tool_name !== 'grade_clause_severity') continue;
      if (isGradingResult(event.result)) continue;
      const inputClauseId =
        typeof (event.input as { clause_id?: unknown })?.clause_id === 'string'
          ? ((event.input as { clause_id: string }).clause_id as string)
          : null;
      if (!inputClauseId) continue;
      if (allowedClauseIds && !allowedClauseIds.has(inputClauseId)) continue;
      if (seen.has(inputClauseId)) continue;
      seen.add(inputClauseId);
      count += 1;
    }
    return count;
  }, [toolEvents, activeLease?.lease_id]);

  const verdict = useMemo(
    () => computeScanVerdict(gradings, ungradedCount),
    [gradings, ungradedCount],
  );

  // Sprint 15 Phase 8 — pulse the summary row once each time the count
  // grows. previousCountRef sees the last-rendered length; if the new
  // length is larger, bump pulseKey to retrigger the animation.
  const previousCountRef = useRef(0);
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (gradings.length > previousCountRef.current) {
      setPulseKey((k) => k + 1);
    }
    previousCountRef.current = gradings.length;
  }, [gradings.length]);

  // Sprint 25.1 (R7) — single timer for the highlight-ring lifecycle.
  // Rapid citation clicks used to schedule overlapping timeouts; the
  // earliest would fire and clear the ring while the user was still
  // looking at the most recent jump. Holding one ref + clear-on-replace
  // ensures the most recent click owns the full HIGHLIGHT_DURATION_MS.
  const highlightTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    },
    [],
  );

  // Sprint 27 — narrate the parser's work in six stages instead of
  // showing a row of identical skeleton cards. Replaces the Sprint 18
  // skeleton block. Reasoning: skeletons told the user "something is
  // loading" but not what; the lifecycle list answers "what is the
  // parser doing right now and what's next" (Jakob Nielsen: visibility
  // of system status; Don Norman: predictable interaction).
  // Sprint 28 — Bug 2: skip the decorative "preparing red flags" beat
  // when there are no findings to prepare. Otherwise the user is
  // parked on a spinning panel for the ~650ms hold even though the
  // scan is genuinely done — a status that doesn't reflect any real
  // work in progress (visibility of system status must be honest).
  const inFlight =
    lifecycle.stage !== 'idle' &&
    lifecycle.stage !== 'review_ready' &&
    lifecycle.stage !== 'preparing_red_flags' &&
    gradings.length === 0;
  if (inFlight) {
    return (
      <div
        className="flex flex-col gap-3"
        data-testid="red-flag-report-scanning"
      >
        <RedFlagsLoadingState snapshot={lifecycle} />
      </div>
    );
  }

  if (gradings.length === 0) {
    return (
      <EmptyState
        testId="red-flag-report-empty"
        align="top"
        icon={
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-fg-subtle dark:bg-neutral-800 dark:text-neutral-500">
            <Paperclip className="h-4 w-4" aria-hidden="true" />
          </div>
        }
        title={
          <p className="text-[12px] text-fg-muted">
            Red flags will appear here as I grade each clause.
          </p>
        }
        actions={
          <div className="mt-6 w-full">
            {/* Sprint 23d Phase 4 — example preview card. Shows the
                tenant what a real red-flag card looks like before any
                scan runs. Rendered at 65% opacity with an "Example"
                eyebrow so it reads as decorative reference, not active
                data. Mirrors the layout of a real card (SeverityBadge
                + clause label + reasoning + citation) so the visual
                pattern is consistent. */}
            <div
              data-testid="red-flag-empty-preview"
              aria-hidden="true"
              className="mb-6 opacity-65"
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                Example
              </p>
              <div className="relative overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-hairline dark:border-neutral-800 dark:bg-neutral-900">
                <span
                  aria-hidden="true"
                  className={`absolute top-0 left-0 h-full w-1 ${SEVERITY_BAR.high}`}
                />
                <div className="py-3 pr-3 pl-4">
                  <div className="flex items-center gap-1.5">
                    {/* Sprint 23i — mirror the live cards' "Nº" plate
                        prefix in the example preview so the editorial
                        pattern is visible before the first scan runs. */}
                    <span
                      aria-hidden="true"
                      className="font-mono text-[10px] tracking-wider text-fg-subtle"
                    >
                      Nº&nbsp;01
                    </span>
                    <SeverityBadge severity="high" size="md" />
                    <span className="truncate text-[11px] font-medium text-fg-default">
                      Security deposit · §3
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-fg-muted">
                    Two months exceeds NJ's 1.5-month security-deposit cap.
                  </p>
                  {/* Sprint 23i — the example citation here also picks
                      up the new `text-citation` token so the preview
                      stays in lock-step with the live CitationChip. */}
                  <p className="mt-2 inline-flex items-start gap-1.5 text-[12px] font-medium text-citation">
                    <Paperclip
                      className="h-3 w-3 shrink-0 translate-y-0.5 text-citation"
                      aria-hidden="true"
                    />
                    NJ Stat 46:8-19
                  </p>
                </div>
              </div>
            </div>
            {/* Sprint 17 §5.5 — bulleted "what we look for" list stays as
                a quick reference under the preview card. */}
            <div
              data-testid="red-flag-report-empty-examples"
              className="w-full"
            >
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                Also catches
              </p>
              <ul className="space-y-1 text-left text-[11px] leading-tight text-fg-muted">
                <li className="flex items-start gap-1.5">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fg-subtle"
                  />
                  <span>One-way attorney's-fee clauses</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fg-subtle"
                  />
                  <span>Unenforceable late-fee structures</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-1 w-1 shrink-0 rounded-full bg-fg-subtle"
                  />
                  <span>Blanket sublet bans</span>
                </li>
              </ul>
            </div>
          </div>
        }
      />
    );
  }

  // Sprint 23d Phase 2 — summary chips now consume SeverityBadge (sm)
  // alongside the count number. Triple-channel severity (icon + label +
  // colour) so the strip reads as a risk meter at a glance, not a
  // colour-coded tally.
  const summaryInner = (
    <>
      {SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s, i, arr) => (
        <span
          key={s}
          className={`inline-flex items-center gap-1 ${
            i < arr.length - 1
              ? "after:ml-1.5 after:text-fg-subtle after:content-['·']"
              : ''
          }`}
        >
          <span className="tabular text-fg-default">{counts[s]}</span>
          <SeverityBadge severity={s} size="sm" />
        </span>
      ))}
    </>
  );

  // Sprint 43.6 — emphasize the verdict once review becomes ready (see
  // verdict-emphasis.ts). The headline is keyed on this flag so it settles a
  // single time at the review-ready transition, not on every grading tick.
  const isReviewReady = lifecycle.stage === 'review_ready';
  const emphasizeVerdict = shouldEmphasizeVerdict(
    isReviewReady,
    mounted,
    reduced,
  );

  // Sprint 54 — one source of truth for the S50.6 single-glide jump (set the
  // active clause, schedule the 4s clear, scroll). Shared by the verdict's
  // "biggest concern" anchor and the per-card jump-to-page.
  const runHighlightJump = (clauseId: string, pageNumber: number): void => {
    setActiveClauseId(clauseId);
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setActiveClauseId(null);
      highlightTimerRef.current = null;
    }, HIGHLIGHT_DURATION_MS);
    pdfViewerRef.current?.scrollToPage(pageNumber);
  };

  // Sprint 54 — the verdict's "biggest concern" becomes a click target when we
  // can anchor it: the clause has an id (high/medium tiers) AND a known page.
  // We split the headline on topClauseTitle so only that phrase is the button
  // (Page Anchoring; Don Norman: the summary is the affordance to the detail).
  const concernTitle = verdict.topClauseTitle;
  const concernGrading =
    verdict.topClauseId != null
      ? gradings.find((g) => g.clause_id === verdict.topClauseId)
      : undefined;
  const concernAnchor =
    verdict.topClauseId != null &&
    concernTitle != null &&
    typeof concernGrading?.page_number === 'number' &&
    verdict.headline.includes(concernTitle)
      ? {
          id: verdict.topClauseId,
          page: concernGrading.page_number,
          title: concernTitle,
          before: verdict.headline.slice(
            0,
            verdict.headline.indexOf(concernTitle),
          ),
          after: verdict.headline.slice(
            verdict.headline.indexOf(concernTitle) + concernTitle.length,
          ),
        }
      : null;

  return (
    // Sprint 23g — relative positioning is required by AnimatePresence
    // `mode="popLayout"` so exiting cards drop out of layout without
    // shifting siblings until the surviving cards' `layout` animation
    // catches up. Wrapping in LayoutGroup shares the layout context so
    // sibling reorders (e.g. when severity changes during a re-grade)
    // interpolate instead of snapping.
    <LayoutGroup>
      <div
        className="relative flex flex-col gap-3"
        data-testid="red-flag-report"
      >
        {/* Sprint 33.B — synthesized verdict headline sits above the count
            strip. Rendered ONLY when at least one valid grading exists
            (verdict.tier !== 'idle'), so the empty state stays clean. */}
        {verdict.tier !== 'idle' ? (
          // Sprint 50.2 — the verdict reads as an OUTCOME, not a tally. A soft
          // tier-tinted halo sits behind the headline (VerdictHalo) and a tier
          // glyph sits beside it (VerdictTierGlyph), so "is this lease bad?" is
          // answered by shape + words + a colour wash — never colour alone.
          // `relative isolate` hosts the halo's -z-10 above the section surface
          // but below the headline (same isolate idiom as the landing blob).
          <div
            data-testid="red-flag-verdict-region"
            data-tier={verdict.tier}
            className="relative isolate"
          >
            <VerdictHalo tier={verdict.tier} />
            <motion.p
              // Sprint 43.6 — one-shot sober settle when review becomes ready: the
              // key flips at the review-ready transition so the headline remounts
              // and animates ONCE. Static during grading and under reduced motion
              // (initial={false}).
              key={emphasizeVerdict ? 'verdict-ready' : 'verdict-pending'}
              data-testid="red-flag-verdict"
              data-tier={verdict.tier}
              // Sprint 35.1 — the verdict is the load-bearing "is this lease bad?"
              // answer, so it earns the brand's editorial-headline face (Source
              // Serif 4 bold, tracking-tight) per MASTER.md — not body sans. Text
              // is balanced so the em-dash clause doesn't orphan on wrap.
              // Sprint 50.2 — flex row so the tier glyph hangs beside the headline
              // without disturbing the editorial type (classes preserved).
              className="relative flex items-start gap-2 text-balance font-serif text-lg font-bold tracking-tight text-fg-default leading-snug"
              initial={emphasizeVerdict ? { opacity: 0.6, y: 2 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={VERDICT_SETTLE_TRANSITION}
            >
              <VerdictTierGlyph tier={verdict.tier} />
              {concernAnchor ? (
                <span>
                  {concernAnchor.before}
                  <button
                    type="button"
                    data-testid="red-flag-verdict-concern"
                    onClick={() =>
                      runHighlightJump(concernAnchor.id, concernAnchor.page)
                    }
                    className="rounded-sm underline decoration-2 decoration-accent-400/60 underline-offset-2 transition-colors hover:text-accent-700 hover:decoration-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 dark:decoration-accent-400/50 dark:hover:text-accent-300"
                  >
                    {concernAnchor.title}
                  </button>
                  {concernAnchor.after}
                </span>
              ) : (
                <span>{verdict.headline}</span>
              )}
            </motion.p>
          </div>
        ) : null}
        {/* Summary row — at-a-glance severity counts. */}
        {animate ? (
          <motion.div
            key={pulseKey}
            data-testid="red-flag-summary"
            className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-fg-muted"
            animate={{ opacity: [1, 0.7, 1] }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          >
            {summaryInner}
          </motion.div>
        ) : (
          <div
            data-testid="red-flag-summary"
            className="flex flex-wrap items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-fg-muted"
          >
            {summaryInner}
          </div>
        )}

        {/* Cards — slide in from the right with an 8px offset. AnimatePresence
          wraps the list so removed cards exit cleanly when a new lease is
          uploaded.
          Sprint 23g — `mode="popLayout"` lets exiting cards drop out
          of layout immediately so siblings spring-fill the gap via
          the `layout` prop on each card, instead of waiting for the
          exit animation to finish before reflowing. */}
        <AnimatePresence initial={false} mode="popLayout">
          {gradings.flatMap((g, gIdx) => {
            // Sprint 51 — severity grouping. `gradings` is already sorted
            // high→medium→low→ok, so the first card of each severity marks a
            // group boundary; emit a counted divider there (the OK group gets a
            // collapsible roll-up instead). Dividers are keyed siblings inside
            // the SAME AnimatePresence as the cards, so the flat-children model
            // (and each card's exit animation) is preserved.
            const isFirstOfSeverity =
              gradings.findIndex((x) => x.severity === g.severity) === gIdx;
            const okHidden = g.severity === 'ok' && !okExpanded;
            const groupHeader = isFirstOfSeverity ? (
              g.severity === 'ok' ? (
                <OkRollup
                  key="red-flag-group-ok"
                  count={counts.ok}
                  expanded={okExpanded}
                  onToggle={() => setOkExpanded((v) => !v)}
                />
              ) : (
                <GroupDivider
                  key={`red-flag-group-${g.severity}`}
                  severity={g.severity}
                  count={counts[g.severity]}
                />
              )
            ) : null;
            const isExpanded = expandedIds.has(g.clause_id);
            const isActive = activeClauseId === g.clause_id;
            const isHovered = hoveredClauseId === g.clause_id;
            // Sprint 46.6 — emphasize this card when its PDF highlight is
            // hovered/focused (and vice versa). Active (the click ring) takes
            // precedence, so the hover ring only shows when not active.
            const hoverHandlers = {
              onMouseEnter: () => setHoveredClauseId(g.clause_id),
              onMouseLeave: () => setHoveredClauseId(null),
              onFocusCapture: () => setHoveredClauseId(g.clause_id),
              onBlurCapture: () => setHoveredClauseId(null),
            };
            const toggle = () => {
              setExpandedIds((prev) => {
                const next = new Set(prev);
                if (next.has(g.clause_id)) next.delete(g.clause_id);
                else next.add(g.clause_id);
                return next;
              });
            };

            // Sprint 18 §4 — single jump-to-page handler shared by the
            // CitationChip (above the fold) and the in-body
            // "View on page N" button (expanded view). Both surfaces drive
            // the same activeClauseId broadcast + PDF scroll so the ring
            // animation kicks off identically regardless of entry point.
            //
            // Sprint 25.1 (R7) — clear any in-flight clear-timer before
            // scheduling a new one so rapid clicks don't clip each other.
            const jumpToClausePage = (clause: GradingResult) => {
              if (typeof clause.page_number !== 'number') return;
              // Sprint 54 — delegates to the shared single-glide handler.
              runHighlightJump(clause.clause_id, clause.page_number);
            };

            // Sprint 18 §4 — the active-card ring used to be a class swap
            // that snapped on/off. Now the card always carries a neutral
            // border; a separately-rendered <ActiveRing /> overlay handles
            // the highlight with a 200ms fade-in → 3.6s hold → 200ms
            // fade-out (driven by HIGHLIGHT_DURATION_MS in the setTimeout).
            // Sprint 50.3 — object quality. The card used to be `bg-surface-card`
            // INSIDE a `bg-surface-card` section (cream-on-cream, no figure-
            // ground — the "lifeless" the user reported). It now rests on
            // `surface-elevated` (the only surface lighter than base) with the
            // warm `--shadow-card` lift, so it reads as paper sitting in the
            // vellum tray. Hover deepens to the warm `--shadow-card-hover`
            // (replacing the cold grey `shadow-lift`). Severity stays on the
            // left bar + badge — no full-card fill tint (CLAUDE.md invariant).
            // Sprint 51 — HIGH cards earn more presence so the eye triages the
            // worst first: they REST at the deeper warm `--shadow-card-hover`
            // lift and carry a one-step-heavier neutral border. Emphasis is
            // depth + edge weight ONLY — never a danger/severity fill tint
            // (invariant) and never colour-alone (the left bar + badge + the
            // group divider all still carry severity by icon + text).
            const isHigh = g.severity === 'high';
            const cardClass = `relative overflow-hidden rounded-lg border bg-surface-elevated transition-shadow ${
              isHigh
                ? 'shadow-card-hover'
                : 'shadow-card hover:shadow-card-hover'
            } ${
              isHovered && !isActive
                ? 'border-accent-300 ring-2 ring-accent-300/50 dark:border-accent-400/50'
                : isHigh
                  ? 'border-neutral-300 dark:border-neutral-700'
                  : 'border-neutral-200 dark:border-neutral-800'
            }`;

            const cardInner = (
              <>
                <span
                  aria-hidden="true"
                  className={`absolute top-0 left-0 h-full w-1 ${SEVERITY_BAR[g.severity]}`}
                />
                <ActiveRing isActive={isActive} reduced={reduced ?? false} />

                {/* Always-visible header. Click anywhere to expand/collapse. */}
                {/* Sprint 18 §4 — the expand toggle covers the severity row +
                  reasoning but NOT the citation. The citation now lives
                  outside this button so it can be its own real <button>
                  (nested buttons are invalid HTML), giving the user a
                  one-click jump-to-page without having to expand the card
                  first. */}
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={isExpanded}
                  data-testid="red-flag-card-toggle"
                  // Sprint 43.5 — sober CSS tap-press (no bounce — tone invariant
                  // for legal-risk content) + a visible INSET focus ring. A
                  // ring-offset ring would be clipped by the card's
                  // overflow-hidden, but ring-inset survives (same idiom as the
                  // ActiveRing overlay), replacing the too-faint focus
                  // background-change. reduced-motion disables the transition +
                  // the scale.
                  className="flex w-full items-start gap-2 py-3 pr-3 pl-4 text-left transition-[background-color,transform] hover:bg-surface-muted/60 active:scale-[0.99] focus-visible:bg-surface-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-300 motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:bg-neutral-800/40 dark:focus-visible:ring-accent-400/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {/* Sprint 23i — editorial "Nº" plate-number prefix
                          on every flag, mirroring Open Design's
                          "PLATE Nº 08" treatment. Reads as an index
                          marker (this is flag N of M) rather than a
                          severity ranking. Zero-padded to 2 digits so
                          a stacked list aligns visually. */}
                      <span
                        aria-hidden="true"
                        className="font-mono text-[10px] tracking-wider text-fg-subtle"
                      >
                        Nº&nbsp;
                        {String((g.clause_index ?? 0) + 1).padStart(2, '0')}
                      </span>
                      {/* Sprint 23d Phase 2 — SeverityBadge replaces the
                        inline pill so severity is communicated by icon
                        + text + colour (handoff §19). */}
                      <SeverityBadge severity={g.severity} size="md" />
                      <span className="truncate text-[11px] font-medium text-fg-default">
                        {clauseLabel(g)}
                      </span>
                    </div>
                    {/* Sprint 24.6 — added `mb-2` so the overview paragraph
                        breathes before the citation row below. Paired with
                        `pt-2` on the citation row sibling so the citation
                        reads as its own evidence row, not a continuation of
                        the paragraph. Net gap (mb-2 + toggle pb-3 + citation
                        pt-2 = 28px) sits in the "calm and premium" range,
                        well above the prior 12px which felt glued. */}
                    <p
                      className={`mt-1.5 mb-2 text-[12px] leading-snug text-fg-muted ${
                        isExpanded ? '' : 'line-clamp-2'
                      }`}
                    >
                      {g.reasoning}
                    </p>
                  </div>
                  {/* Sprint 24.2 — chevron rotation duration bumped from
                      Tailwind's 150ms default to 220ms `ease-out-soft` so
                      the icon rotation lands in sync with the body height
                      animation (~500ms spring). Without this the chevron
                      finished its rotation before the body even started
                      revealing, which was part of the "snappy" feel. */}
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 text-fg-subtle transition-transform duration-220 ease-out-soft ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {/* Citation row — sibling of the toggle, click-isolated.
                  When page_number is set the chip becomes clickable and
                  drives the same activeClauseId + scrollToPage flow as
                  the in-body "View on page N" button below.
                  Sprint 24.6 — `pt-2` paired with `mb-2` on the overview
                  paragraph above creates a deliberate gap so the citation
                  reads as its own evidence row supporting the paragraph,
                  not a trailing line of it. The subtle border-t on the
                  Recommended-action section below remains the divider
                  between citation (evidence) and action (next step). */}
                <div
                  data-testid="red-flag-citation-row"
                  className="px-4 pt-2 pb-3"
                >
                  <CitationChip
                    statuteCitation={g.statute_citation}
                    pageNumber={g.page_number}
                    onClick={
                      typeof g.page_number === 'number'
                        ? () => jumpToClausePage(g)
                        : undefined
                    }
                  />
                </div>

                {/*
                  Sprint 24.4 — Expanded body, animation v2.

                  v1 (Sprint 24.2) ran opacity 0→1 in parallel with
                  height 0→auto. Two problems:
                    (a) opacity reached 1 at ~220ms while the height
                        spring was still settling at ~500ms — content
                        was painted at full strength inside a
                        still-growing card, so users saw the body
                        "drop in" via overflow cropping rather than a
                        smooth reveal. The opacity tween made the
                        content feel "dropped in" because it landed
                        before the box was ready.
                    (b) the outer motion.article had `layout` (animates
                        both position AND size) which double-animated
                        the size axis against this inner height tween,
                        amplifying the mismatch.

                  v2 (this sprint) fixes both:
                    - `layout="position"` on the article (one line up)
                      removes the size double-tween. Article only
                      animates its position; the body owns its size.
                    - Drop the opacity tween entirely. `overflow:
                      hidden` on the motion.div already clips content
                      during the height grow — that IS the reveal, and
                      it's cleaner because the content appears
                      gradually from the top edge as the box reveals
                      it, exactly like a real accordion drawer.
                    - Slow the height spring (170 / 32 / 1.0 — settles
                      ~620ms, no overshoot) so the reveal reads as
                      deliberate, not snappy.

                  Reduced-motion users still fall back to the instant
                  conditional render.
                */}
                {animate ? (
                  <AnimatePresence initial={false}>
                    {isExpanded ? (
                      <motion.div
                        key="body"
                        data-testid="red-flag-card-body"
                        data-motion="on"
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{
                          type: 'spring',
                          stiffness: 170,
                          damping: 32,
                          mass: 1.0,
                        }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="border-t border-neutral-100 bg-surface-muted/40 px-4 py-3 pl-5 dark:border-neutral-800 dark:bg-neutral-800/30">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                            Recommended action
                          </p>
                          <p className="mt-1 text-[12px] leading-relaxed text-fg-default">
                            {g.recommended_action}
                          </p>
                          <CardActions
                            grading={g}
                            onJumpToPage={jumpToClausePage}
                            onExplainPlain={() =>
                              fab.openWith({
                                initialPrompt: plainEnglishPromptFor(g),
                                clauseId: g.clause_id,
                                severity: g.severity,
                                statuteCitation: g.statute_citation,
                              })
                            }
                            onExplain={() =>
                              fab.openWith({
                                initialPrompt: explainPromptFor(g),
                                clauseId: g.clause_id,
                                severity: g.severity,
                                statuteCitation: g.statute_citation,
                              })
                            }
                            onDraftEmail={() =>
                              fab.openWith({
                                initialPrompt: draftEmailPromptFor(g),
                                clauseId: g.clause_id,
                                severity: g.severity,
                                statuteCitation: g.statute_citation,
                              })
                            }
                          />
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                ) : isExpanded ? (
                  <div
                    data-testid="red-flag-card-body"
                    data-motion="off"
                    className="border-t border-neutral-100 bg-surface-muted/40 px-4 py-3 pl-5 dark:border-neutral-800 dark:bg-neutral-800/30"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                      Recommended action
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-fg-default">
                      {g.recommended_action}
                    </p>
                    <CardActions
                      grading={g}
                      onJumpToPage={jumpToClausePage}
                      onExplainPlain={() =>
                        fab.openWith({
                          initialPrompt: plainEnglishPromptFor(g),
                          clauseId: g.clause_id,
                          severity: g.severity,
                          statuteCitation: g.statute_citation,
                        })
                      }
                      onExplain={() =>
                        fab.openWith({
                          initialPrompt: explainPromptFor(g),
                          clauseId: g.clause_id,
                          severity: g.severity,
                          statuteCitation: g.statute_citation,
                        })
                      }
                      onDraftEmail={() =>
                        fab.openWith({
                          initialPrompt: draftEmailPromptFor(g),
                          clauseId: g.clause_id,
                          severity: g.severity,
                          statuteCitation: g.statute_citation,
                        })
                      }
                    />
                  </div>
                ) : null}
              </>
            );

            const cardEl = animate ? (
              <motion.article
                key={g.clause_id}
                data-testid="red-flag-card"
                data-severity={g.severity}
                data-expanded={isExpanded ? 'true' : 'false'}
                data-active={isActive ? 'true' : 'false'}
                data-hovered={isHovered ? 'true' : 'false'}
                {...hoverHandlers}
                className={cardClass}
                // Sprint 23g — `layout` makes the card spring into place
                // when siblings exit or when severity reorders the list.
                // Combined with the parent LayoutGroup + popLayout mode,
                // grading streams in (and re-grades reorder) smoothly
                // instead of snapping.
                //
                // Sprint 24.4 — switched from `layout` (animates BOTH
                // position AND size) to `layout="position"` so the inner
                // accordion-body motion.div owns the size tween. With
                // plain `layout`, the article's own bounding-box snapshot
                // ran a linear tween on size while the inner div ran a
                // spring on height — two competing animations on the same
                // axis, which is what caused the "drops information"
                // mismatch the user reported. `layout="position"` keeps
                // sibling reordering smooth via LayoutGroup while letting
                // the body own its height.
                layout="position"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={SPRING_GENTLE}
              >
                {cardInner}
              </motion.article>
            ) : (
              <article
                key={g.clause_id}
                data-testid="red-flag-card"
                data-severity={g.severity}
                data-expanded={isExpanded ? 'true' : 'false'}
                data-active={isActive ? 'true' : 'false'}
                data-hovered={isHovered ? 'true' : 'false'}
                {...hoverHandlers}
                className={cardClass}
              >
                {cardInner}
              </article>
            );
            // Sprint 51 — emit the group header (if this card starts a group)
            // then the card itself, unless it's an OK card while the roll-up is
            // collapsed. flatMap flattens these into the AnimatePresence's flat
            // child list.
            const out: React.JSX.Element[] = [];
            if (groupHeader) out.push(groupHeader);
            if (!okHidden) out.push(cardEl);
            return out;
          })}
        </AnimatePresence>

        {/*
        Sprint 18 §2 — trailing skeletons for clauses the scan hasn't yet
        attempted. We base the count on `scan.attempted` (success + error)
        rather than `gradings.length` (success only) so a clause whose
        grading errored doesn't leave a permanent ghost skeleton in the
        rail. Once the phase reaches 'complete' (every clause processed),
        no skeletons render even if some gradings failed — the user sees
        only the cards we actually have data for.
      */}
        {scan.phase === 'grading' && scan.total > scan.attempted
          ? Array.from({ length: scan.total - scan.attempted }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders are interchangeable until real cards land
              <RedFlagSkeletonCard key={`pending-${i}`} delay={i * 0.08} />
            ))
          : null}
        {/* Sprint 33.B — errored-clause hand-off. Renders ONLY when at
            least one grade_clause_severity event came back as an error
            envelope (e.g. citation grounding rejected). Clicking opens
            the FAB drawer with a pre-filled question; this keeps the
            chat as the consistent "ask why" surface for the explanation
            without forcing the user to type it themselves. */}
        {ungradedCount > 0 ? (
          <button
            type="button"
            data-testid="red-flag-ungraded-line"
            onClick={() =>
              fab.openWith({
                initialPrompt:
                  "Why couldn't these clauses be graded? Walk me through which ones and what went wrong.",
              })
            }
            className="flex items-center gap-1.5 self-start rounded-md py-1 text-[12px] text-fg-muted hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2"
          >
            <span>
              {ungradedCount === 1
                ? "1 clause couldn't be graded"
                : `${ungradedCount} clauses couldn't be graded`}
            </span>
            <span aria-hidden="true" className="text-fg-subtle">
              ·
            </span>
            <span className="underline-offset-2 hover:underline">
              view in chat
            </span>
          </button>
        ) : null}
      </div>
    </LayoutGroup>
  );
}

/*
 * Sprint 18 §4 — active-card ring overlay.
 *
 * Replaces the className-swap snap with a true cross-fade. The overlay
 * is absolutely positioned, pointer-events:none (clicks pass through to
 * the card), and aria-hidden (purely decorative — the active-card state
 * is already conveyed by the card border + scroll behaviour). With
 * reduced motion, the overlay still shows when active but skips the
 * fade — the user sees the same on/off behaviour as before the polish.
 *
 * Duration math: HIGHLIGHT_DURATION_MS (4000ms) is split as
 * ~200ms fade-in (motion default) + ~3600ms hold + ~200ms fade-out.
 * The hold + fade-out are gated by the parent's setTimeout that clears
 * activeClauseId; once cleared, AnimatePresence runs the exit transition.
 */
/*
 * Sprint 26c / 35 — expanded-card action row.
 *
 * Renders four buttons under the recommended-action paragraph, ordered by the
 * tenant's decision flow (orient -> understand simply -> go to source -> act):
 *   1. View on page N — preserved from prior sprints, calls scrollToPage.
 *   2. Plain English (Sprint 35) — opens the FAB drawer with a jargon-free,
 *      tenant-facing prompt (plainEnglishPromptFor). Parser-first / jargon-last,
 *      so it sits first among the explanation pills.
 *   3. What the law says — opens the FAB drawer with the statute-verbatim
 *      walkthrough (explainPromptFor). Sprint 35 relabeled this from "Explain"
 *      (+ BookOpen icon) to disambiguate it from Plain English; its testid
 *      (red-flag-explain) + prompt are unchanged so unit + e2e selectors hold.
 *   4. Draft email — opens the FAB drawer with a draft-email prompt.
 *
 * All buttons stopPropagation so they don't also collapse the card
 * (the parent toggle button covers the header + summary row, and the
 * recommended-action region sits inside the card, beneath the toggle).
 */
function CardActions({
  grading,
  onJumpToPage,
  onExplainPlain,
  onExplain,
  onDraftEmail,
}: {
  grading: GradingResult;
  onJumpToPage: (g: GradingResult) => void;
  onExplainPlain: () => void;
  onExplain: () => void;
  onDraftEmail: () => void;
}): React.JSX.Element {
  // Sprint 53 — three clear actions instead of four equal pills, ordered by the
  // tenant's flow (orient → understand → act). The two explanation pills merge
  // into one segmented "Explain" control (two facets of one understand-step,
  // not two separate actions); "Draft email" is promoted to the primary act
  // (accent tint); "View on page N" is the quiet orient anchor. Both
  // explanation prompts stay reachable, so the source-grounding contract holds.
  const quietPill =
    'inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-surface-card px-2.5 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:border-accent-300 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-accent-400/40 dark:hover:text-accent-200';
  const primaryPill =
    'inline-flex items-center gap-1.5 rounded-md border border-accent-300 bg-accent-50/60 px-2.5 py-1 text-[11px] font-medium text-accent-700 transition-colors hover:border-accent-400 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 dark:border-accent-400/40 dark:bg-accent-500/12 dark:text-accent-200 dark:hover:bg-accent-500/20';
  const segment =
    'inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-fg-muted transition-colors hover:bg-accent-50/50 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-300 dark:hover:bg-accent-500/12 dark:hover:text-accent-200';
  return (
    <div
      data-testid="red-flag-card-actions"
      className="mt-3 flex flex-wrap items-center gap-2"
    >
      {typeof grading.page_number === 'number' ? (
        <button
          type="button"
          data-testid="red-flag-jump-to-page"
          onClick={(e) => {
            e.stopPropagation();
            onJumpToPage(grading);
          }}
          className={quietPill}
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          View on page {grading.page_number}
        </button>
      ) : null}
      {/* Sprint 53 — segmented "Explain" control. The two facets (parser-first:
          plain English, then the statute) read as one understand-step instead
          of two competing pills. Both keep their stable testids + prompts so
          unit + e2e selectors and the grounding contract hold. */}
      <div
        data-testid="red-flag-explain-group"
        className="inline-flex items-center overflow-hidden rounded-md border border-neutral-200 bg-surface-card dark:border-neutral-700 dark:bg-neutral-900"
      >
        <span className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
          Explain
        </span>
        <button
          type="button"
          data-testid="red-flag-explain-plain"
          onClick={(e) => {
            e.stopPropagation();
            onExplainPlain();
          }}
          className={`${segment} border-l border-neutral-200 dark:border-neutral-700`}
        >
          <Languages className="h-3 w-3" aria-hidden="true" />
          Plain English
        </button>
        <button
          type="button"
          data-testid="red-flag-explain"
          onClick={(e) => {
            e.stopPropagation();
            onExplain();
          }}
          className={`${segment} border-l border-neutral-200 dark:border-neutral-700`}
        >
          <BookOpen className="h-3 w-3" aria-hidden="true" />
          The law
        </button>
      </div>
      <button
        type="button"
        data-testid="red-flag-draft-email"
        onClick={(e) => {
          e.stopPropagation();
          onDraftEmail();
        }}
        className={primaryPill}
      >
        <Mail className="h-3 w-3" aria-hidden="true" />
        Draft email
      </button>
    </div>
  );
}

/*
 * Sprint 50.2 — verdict outcome cues.
 *
 * VerdictHalo: a soft, tier-tinted radial wash BEHIND the headline so the scan
 * reads as a result, not a tally (Jakob Nielsen: the outcome is visible).
 * Decorative only — aria-hidden, pointer-events:none, -z so it never affects
 * the headline's contrast (fg-default ≈ 14.8:1 on card). Alpha is held low (a
 * wash, never a fill) so low-tier's info-blue can't be mistaken for a citation.
 *
 * VerdictTierGlyph: the SAME severity glyph SeverityBadge uses, hung beside the
 * headline as the non-colour (shape) channel. aria-hidden so the headline words
 * remain the accessible name.
 */
function VerdictHalo({ tier }: { tier: Severity }): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-testid="red-flag-verdict-halo"
      data-tier={tier}
      className="pointer-events-none absolute -inset-x-3 -top-3 -bottom-1 -z-10 rounded-2xl"
      style={{
        background: `radial-gradient(70% 130% at 0% 0%, color-mix(in srgb, ${VERDICT_TIER_VAR[tier]} 13%, transparent), transparent 72%)`,
      }}
    />
  );
}

function VerdictTierGlyph({ tier }: { tier: Severity }): React.JSX.Element {
  const Icon = SEVERITY_ICON[tier];
  return (
    <Icon
      aria-hidden="true"
      data-testid="red-flag-verdict-glyph"
      data-tier={tier}
      className="mt-1 h-4 w-4 shrink-0"
      strokeWidth={2.5}
      style={{ color: VERDICT_TIER_VAR[tier] }}
    />
  );
}

/*
 * Sprint 51 — severity group header. Breaks the uniform card wall into
 * tiers so the eye triages worst-first instead of scanning a flat stack
 * (Wathan/Schoger hierarchy; IBM Carbon / Material sectioned lists). Reuses
 * the summary-count idiom (SeverityBadge sm + count) so it speaks the existing
 * visual language. Severity is carried by the badge (icon + text + colour),
 * never colour alone; `data-severity` is exposed for tests.
 */
function GroupDivider({
  severity,
  count,
}: {
  severity: Severity;
  count: number;
}): React.JSX.Element {
  return (
    <div
      data-testid="red-flag-group"
      data-severity={severity}
      className="flex items-center gap-2 pt-1 first:pt-0"
    >
      <SeverityBadge severity={severity} size="sm" />
      <span className="tabular text-[11px] font-medium text-fg-default">
        {count}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-border-hairline" />
    </div>
  );
}

/*
 * Sprint 51 — the OK group's collapsible roll-up. Compliant clauses fold behind
 * one line by default so the rail leads with risk; the tenant can expand to
 * audit the full set (Steve Krug: don't make me scan past N identical "OK"
 * cards). A real <button aria-expanded> keeps it keyboard-operable (Material
 * component states, WCAG). Severity still shown by the OK badge (icon + text +
 * colour).
 */
function OkRollup({
  count,
  expanded,
  onToggle,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      data-testid="red-flag-ok-rollup"
      aria-expanded={expanded}
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-md pt-1 text-left text-[12px] text-fg-muted transition-colors hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2"
    >
      <SeverityBadge severity="ok" size="sm" />
      <span className="text-fg-default">
        {count === 1
          ? '1 clause looks standard'
          : `${count} clauses look standard`}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-border-hairline" />
      <ChevronDown
        aria-hidden="true"
        className={`h-3.5 w-3.5 shrink-0 transition-transform duration-220 ease-out-soft ${
          expanded ? 'rotate-180' : ''
        }`}
      />
    </button>
  );
}

function ActiveRing({
  isActive,
  reduced,
}: {
  isActive: boolean;
  reduced: boolean;
}): React.JSX.Element {
  // Reduced motion: render the static overlay directly (no fade), to
  // preserve the visual cue without animation. The exit / enter is
  // instant because we conditionally render the element itself.
  if (reduced) {
    return (
      <>
        {isActive ? (
          <span
            aria-hidden="true"
            data-testid="red-flag-active-ring"
            data-motion="off"
            className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-accent-300 ring-inset dark:ring-accent-400/50"
          />
        ) : null}
      </>
    );
  }
  return (
    <AnimatePresence>
      {isActive ? (
        <motion.span
          aria-hidden="true"
          data-testid="red-flag-active-ring"
          data-motion="on"
          className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-accent-300 ring-inset dark:ring-accent-400/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        />
      ) : null}
    </AnimatePresence>
  );
}
