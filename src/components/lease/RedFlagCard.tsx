'use client';

/*
 * Sprint 55.3 — per-card presenter, extracted from RedFlagReport.tsx.
 *
 * One red-flag card: the severity bar + Nº plate + badge + clause label, the
 * collapsible reasoning toggle, the citation row, and the expandable
 * recommended-action body (CardActions). The card is a PURE presenter — it
 * owns NO state and reaches across NO providers. The parent (RedFlagReport)
 * derives expand/active/hover from its contexts and passes them in, along with
 * the toggle / jump / hover / assistant-seed callbacks (Robert C. Martin:
 * presentation split from orchestration/state; React Team: state ownership
 * stays in the parent).
 *
 * Behavior-preserving: red-flag-card + data-severity/-expanded/-active/-hovered,
 * red-flag-card-toggle, red-flag-citation-row, red-flag-card-body (data-motion
 * on/off), and the CardActions / ActiveRing testids are unchanged. The card is
 * a keyed direct child of the parent's <AnimatePresence mode="popLayout">; the
 * inner motion.article reads presence via context, so enter/exit/layout still
 * animate exactly as before.
 */

import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Languages,
  Mail,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { SPRING_GENTLE } from '@/lib/motion/presets';
import { CitationChip } from './CitationChip';
import { clauseLabel, type GradingResult, SEVERITY_BAR } from './grading';
import { SeverityBadge } from './SeverityBadge';

export interface RedFlagCardProps {
  grading: GradingResult;
  isExpanded: boolean;
  isActive: boolean;
  isHovered: boolean;
  /** mounted && !reduced — when false the card renders the instant (no-motion) form. */
  animate: boolean;
  reduced: boolean;
  onToggle: () => void;
  onJumpToPage: (g: GradingResult) => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onExplainPlain: () => void;
  onExplain: () => void;
  onDraftEmail: () => void;
}

export function RedFlagCard({
  grading,
  isExpanded,
  isActive,
  isHovered,
  animate,
  reduced,
  onToggle,
  onJumpToPage,
  onHoverStart,
  onHoverEnd,
  onExplainPlain,
  onExplain,
  onDraftEmail,
}: RedFlagCardProps): React.JSX.Element {
  // Sprint 46.6 — emphasize this card when its PDF highlight is hovered/focused
  // (and vice versa). Active (the click ring) takes precedence, so the hover
  // ring only shows when not active.
  const hoverHandlers = {
    onMouseEnter: onHoverStart,
    onMouseLeave: onHoverEnd,
    onFocusCapture: onHoverStart,
    onBlurCapture: onHoverEnd,
  };

  // Sprint 18 §4 — the active-card ring used to be a class swap that snapped
  // on/off. Now the card always carries a neutral border; a separately-rendered
  // <ActiveRing /> overlay handles the highlight with a 200ms fade-in → 3.6s
  // hold → 200ms fade-out (driven by HIGHLIGHT_DURATION_MS in the parent's
  // setTimeout).
  // Sprint 50.3 — object quality. The card used to be `bg-surface-card` INSIDE a
  // `bg-surface-card` section (cream-on-cream, no figure-ground — the "lifeless"
  // the user reported). It now rests on `surface-elevated` (the only surface
  // lighter than base) with the warm `--shadow-card` lift, so it reads as paper
  // sitting in the vellum tray. Hover deepens to the warm `--shadow-card-hover`
  // (replacing the cold grey `shadow-lift`). Severity stays on the left bar +
  // badge — no full-card fill tint (CLAUDE.md invariant).
  // Sprint 51 — HIGH cards earn more presence so the eye triages the worst
  // first: they REST at the deeper warm `--shadow-card-hover` lift and carry a
  // one-step-heavier neutral border. Emphasis is depth + edge weight ONLY —
  // never a danger/severity fill tint (invariant) and never colour-alone (the
  // left bar + badge + the group divider all still carry severity by icon +
  // text).
  const isHigh = grading.severity === 'high';
  const cardClass = `relative overflow-hidden rounded-lg border bg-surface-elevated transition-shadow ${
    isHigh ? 'shadow-card-hover' : 'shadow-card hover:shadow-card-hover'
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
        className={`absolute top-0 left-0 h-full w-1 ${SEVERITY_BAR[grading.severity]}`}
      />
      <ActiveRing isActive={isActive} reduced={reduced} />

      {/* Always-visible header. Click anywhere to expand/collapse. */}
      {/* Sprint 18 §4 — the expand toggle covers the severity row +
          reasoning but NOT the citation. The citation now lives
          outside this button so it can be its own real <button>
          (nested buttons are invalid HTML), giving the user a
          one-click jump-to-page without having to expand the card
          first. */}
      <button
        type="button"
        onClick={onToggle}
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
              {String((grading.clause_index ?? 0) + 1).padStart(2, '0')}
            </span>
            {/* Sprint 23d Phase 2 — SeverityBadge replaces the
                inline pill so severity is communicated by icon
                + text + colour (handoff §19). */}
            <SeverityBadge severity={grading.severity} size="md" />
            <span className="truncate text-[11px] font-medium text-fg-default">
              {clauseLabel(grading)}
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
            {grading.reasoning}
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
      <div data-testid="red-flag-citation-row" className="px-4 pt-2 pb-3">
        <CitationChip
          statuteCitation={grading.statute_citation}
          pageNumber={grading.page_number}
          onClick={
            typeof grading.page_number === 'number'
              ? () => onJumpToPage(grading)
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
                  {grading.recommended_action}
                </p>
                <CardActions
                  grading={grading}
                  onJumpToPage={onJumpToPage}
                  onExplainPlain={onExplainPlain}
                  onExplain={onExplain}
                  onDraftEmail={onDraftEmail}
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
            {grading.recommended_action}
          </p>
          <CardActions
            grading={grading}
            onJumpToPage={onJumpToPage}
            onExplainPlain={onExplainPlain}
            onExplain={onExplain}
            onDraftEmail={onDraftEmail}
          />
        </div>
      ) : null}
    </>
  );

  return animate ? (
    <motion.article
      data-testid="red-flag-card"
      data-severity={grading.severity}
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
      data-testid="red-flag-card"
      data-severity={grading.severity}
      data-expanded={isExpanded ? 'true' : 'false'}
      data-active={isActive ? 'true' : 'false'}
      data-hovered={isHovered ? 'true' : 'false'}
      {...hoverHandlers}
      className={cardClass}
    >
      {cardInner}
    </article>
  );
}

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
