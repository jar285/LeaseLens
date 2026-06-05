// Sprint 26c — assistant FAB (real implementation).
//
// Renders the closed pill in `bottom-6 right-6`, a quick-action menu
// that fans out above it, and a drawer that mounts the full ChatUI
// (transcript + composer). State machine lives in AssistantFabContext.
//
// Lazy-import shape: this file is the "client" implementation. The
// sibling AssistantFab.tsx wraps it in `next/dynamic({ ssr: false })`
// so the chat bundle only ships when the user actually opens the FAB.

'use client';

import { Maximize2, MessageCircle, Minimize2, X } from 'lucide-react';
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LeaseLensMark } from '@/components/brand/LeaseLensMark';
import { clauseLabel, isGradingResult } from '@/components/lease/grading';
import { useLeaseParser } from '@/components/lease/LeaseParserContext';
import { useScanLifecycle } from '@/components/lease/scan-lifecycle';
import { useAssistantFab } from './AssistantFabContext';
import { ChatUI, type ChatUIProps } from './ChatUI';

export interface AssistantFabClientProps {
  workspaceName: ChatUIProps['workspaceName'];
  conversationId: ChatUIProps['conversationId'];
  initialMessages: ChatUIProps['initialMessages'];
  /**
   * Forwarded to the embedded ChatUI so streamed tool events still
   * land in ChatStreamContext (which RedFlagReport + ClausesList
   * read). When omitted the chat streams into its own local state
   * only, which is fine for the landing page where no parser
   * surfaces are mounted.
   */
  onToolEvent?: ChatUIProps['onToolEvent'];
}

interface Chip {
  id: string;
  label: string;
  prompt: string;
  /**
   * Computed enabled-state given the current ChatStreamContext.
   * Disabled chips are still rendered so the user understands what's
   * possible — only enabled when their precondition holds.
   */
  enabled: (ctx: ChipContext) => boolean;
}

interface ChipContext {
  hasActiveClause: boolean;
  hasGradings: boolean;
}

// Sprint 26c → Sprint 29.4 — three job-aware chip sets. The chip row
// inside the drawer reflects what the user can actually act on right
// now, so the assistant never offers a clause-specific affordance
// when there's no clause to act on (Don Norman: signifiers should
// match available actions; Jakob Nielsen: visibility of system
// status, applied to the help surface).
//
// REVIEW_READY_CHIPS keeps the original four-chip set (rename only)
// so the existing Sprint 27 contracts — "Explain this clause" is
// disabled when no clause is selected, "Draft a negotiation email"
// is disabled when no gradings have streamed — continue to hold.
const ONBOARDING_CHIPS: Chip[] = [
  // Sprint 38.7 — chip LABELS shortened to a compact triad so the no-lease
  // "Try asking" set packs onto one row (was 3 stacked rows ≈ 155px). The full
  // `prompt` (the actual question sent on click) is unchanged — only the
  // button text is terser (Steve Krug: scannable quick actions).
  {
    id: 'how-it-works',
    label: 'How it works',
    prompt:
      'How does LeaseLens work? Walk me through what happens after I upload a lease.',
    enabled: () => true,
  },
  {
    id: 'what-it-checks',
    label: 'What it checks',
    prompt:
      'What clause types does LeaseLens check and which NJ statutes does it use?',
    enabled: () => true,
  },
  {
    id: 'after-upload',
    label: 'After upload',
    prompt:
      "Once I upload a lease, what should I expect to see? How long does the scan take and what's the result?",
    enabled: () => true,
  },
];
// Sprint 33.A — scan-agnostic Q&A chip set. The prior Sprint 29.4
// three-way split (onboarding / mid-scan / review-ready) is retired:
// the chat is no longer narrating the scan, so the chip set is the
// same whether the scan is mid-flight or complete. All four chips
// are gated on `hasGradings` because every prompt references "the
// highest-severity finding" or similar — they don't make sense
// before any grading has landed. The chip strip reads as disabled
// during mid-scan, which matches the empty-state-subhead "Ask about
// any clause, citation, finding…" affordance.
const QA_CHIPS: Chip[] = [
  {
    id: 'explain-top-finding',
    label: 'Explain the highest-risk clause',
    prompt:
      "Walk me through the highest-severity finding in the current lease in plain English — what's the risk and what should I do about it?",
    enabled: (c) => c.hasGradings,
  },
  {
    id: 'draft-biggest-concern-email',
    label: 'Draft an email about my biggest concern',
    prompt:
      'Draft a polite negotiation email to my landlord about the highest-severity finding.',
    enabled: (c) => c.hasGradings,
  },
  {
    id: 'compare-to-nj-law',
    label: 'Compare to NJ law',
    prompt:
      'For the highest-severity finding, use search_corpus and show what NJ law says vs what the lease says.',
    enabled: (c) => c.hasGradings,
  },
  {
    id: 'what-to-fix-first',
    label: 'What should I fix first?',
    prompt:
      'Rank the findings by what I should push back on first, given both severity and how realistic it is to get the landlord to agree.',
    enabled: (c) => c.hasGradings,
  },
];

// Sprint 36 — context-sized drawer. The display mode is DERIVED (not a new
// AssistantFabState): no lease → compact-help; user-expanded → expanded-reading;
// else workspace-drawer (today's size, unchanged). Each maps to width/height
// classes; a shared `max-sm:` suffix keeps every mode a safe near-fullscreen
// sheet on phones. Reuses the existing min(…, calc(100vw-3rem)) clamp idiom.
type DisplayMode =
  | 'compact-help'
  | 'landing-chat'
  | 'workspace-drawer'
  | 'expanded-reading';

const SIZE_BY_MODE: Record<DisplayMode, string> = {
  // Height tracks the no-lease content (status pill + orienting subhead +
  // one-row "Try asking" chips + composer). 36.6 bumped to 580 for a tall
  // duplicate-title hero (since removed); 38.6 reclaimed the toolbar void and
  // 38.7 collapsed the chips to a single row, so the content is now ~390px —
  // sizing the panel to it removes the dead space below the composer while
  // keeping the subhead unclipped. Still well under the 720px workspace.
  'compact-help': 'w-[min(420px,calc(100vw-3rem))] h-[min(390px,70vh)]',
  // Sprint 37.3 — no lease, but the user has asked a question: grow the
  // popover "slightly" (a touch wider for readable answers + taller for the
  // thread) without becoming the full workspace drawer. Still expandable to
  // expanded-reading for a long answer.
  'landing-chat': 'w-[min(460px,calc(100vw-3rem))] h-[min(620px,82vh)]',
  'workspace-drawer':
    'w-[min(560px,calc(100vw-3rem))] lg:w-[min(620px,calc(100vw-3rem))] h-[min(720px,80vh)]',
  // Sprint 36.1 — height is clamped to the space ABOVE the bottom-28 anchor
  // (7rem) plus a 2rem top inset → calc(100vh-9rem). A raw 92vh panel anchored
  // 112px off the bottom pushes its top (the header with Collapse/Close) above
  // the viewport on any screen shorter than ~1400px, leaving the user no way to
  // collapse except closing the whole drawer. This keeps the header in view at
  // every viewport while still using the full 900px on tall screens.
  'expanded-reading':
    'w-[min(720px,calc(100vw-3rem))] lg:w-[min(820px,calc(100vw-3rem))] h-[min(900px,calc(100vh-9rem))]',
};

const MOBILE_SAFE_SIZE =
  'max-sm:w-[calc(100vw-2rem)] max-sm:h-[min(85vh,calc(100vh-7rem))]';

// Sprint 36.4 — open/close + resize motion. The drawer stays mounted (drafts
// persist), so a class-toggle CSS transition animates BOTH directions; the
// `starting:` values ease the very first open (the drawer mounts straight into
// the open state). Scales from the pill corner; reduced-motion disables it.
// Sprint 38.3 — open/close + resize motion. Reads as expanding from the FAB:
// opacity 0→1, scale 0.96→1, and a 12px rise (translate-y-3→0), ~180ms on the
// brand `ease-out-soft` curve (= cubic-bezier(0.22,1,0.36,1), the brief's
// easing). The `starting:` values ease the very first open (the drawer mounts
// straight into the open state). Width/height stay in the transition so the
// expand/collapse resize morphs. Reduced-motion disables it (instant, no transform).
// Sprint 38.8 — per-property durations (set inline as DRAWER_RESIZE_TIMING):
// open/close (opacity/scale/translate) stays snappy at 180ms, but the
// expand/collapse RESIZE (width/height) eases over a longer 280ms so a big
// grow (e.g. landing-chat 460px → expanded-reading 820px) reads as a graceful,
// deliberate morph instead of an abrupt 180ms snap. `transition-none` under
// reduced-motion still wins (it nulls transition-property regardless of duration).
const DRAWER_MOTION =
  'origin-bottom-right transition-[opacity,scale,translate,width,height] ease-out-soft starting:opacity-0 starting:scale-95 starting:translate-y-3 motion-reduce:transition-none';

// Durations map 1:1 to the transition-property order above:
// opacity, scale, translate (open/close = 180ms) · width, height (resize = 280ms).
const DRAWER_RESIZE_TIMING = '180ms, 180ms, 180ms, 280ms, 280ms';

// Sprint 36.3 — scan-status dot, reusing the masthead "● LIVE" vocabulary.
// Always paired with the status word, so colour is never the only signal.
type StatusTone = 'complete' | 'scanning' | 'ready';
const STATUS_DOT: Record<StatusTone, string> = {
  complete: 'bg-success-600',
  scanning: 'bg-accent-500',
  ready: 'bg-neutral-400 dark:bg-neutral-500',
};

export function AssistantFabClient({
  workspaceName,
  conversationId,
  initialMessages,
  onToolEvent,
}: AssistantFabClientProps): React.JSX.Element {
  const fab = useAssistantFab();
  const parser = useLeaseParser();
  const pillRef = useRef<HTMLButtonElement>(null);
  // Sprint 29.9 — drawer ref so the open transition can move focus
  // into the drawer container. Without this, focus stays on the
  // pill after click, Escape fires on the pill (no handler there),
  // and the drawer never closes via keyboard.
  const drawerRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  // Sprint 36 — user-controlled "reading" expansion. Local state, NOT a
  // context field: it's pure presentation (only changes the drawer's size
  // classes). The drawer DOM + ChatUI instance persist across re-render, so
  // toggling never resets messages/draft/selection. Reset on close (below) so
  // reopening starts at the natural per-context size.
  const [expanded, setExpanded] = useState(false);
  // Sprint 37.3 — has the user asked anything yet? Reported up from ChatUI
  // (boolean only). Drives `landing-chat`: no lease + a thread exists → the
  // popover grows slightly so answers have room. Local presentation state,
  // not context (keeps the AssistantFabContext boundary clean).
  const [hasAskedQuestion, setHasAskedQuestion] = useState(false);

  const chipContext: ChipContext = {
    hasActiveClause: parser.activeClauseId !== null,
    hasGradings: parser.toolEvents.some(
      (e) => e.tool_name === 'grade_clause_severity',
    ),
  };

  // Sprint 29.3 — assistant context bar derived state.
  //
  // Sprint 29.4 — `chips` + empty-state heading/subhead also derive
  // from the same lifecycle.stage signal so the drawer never offers
  // a clause-specific affordance the user can't yet act on, and the
  // empty-state copy stays in lockstep with the chip row.
  //
  // `usingParts` answers "what is the assistant attached to?" — the
  // filename + clause count + scan-stage label, or a plain "No lease
  // attached" sentence when nothing is mounted. `focusLabel` answers
  // "is the assistant focused on a specific clause?" — it's null when
  // `fab.selection.clauseId` is unset, so the focus row disappears.
  const lifecycle = useScanLifecycle();
  // Sprint 36.2 — split into a mono filename (a technical identifier per
  // MASTER.md) + muted metadata (clause count · scan stage), so the bar reads
  // identity → metadata instead of one flat prototype-y run. `filename` is null
  // when no lease, in which case `meta` carries the "No lease attached"
  // sentence. Visible text is unchanged (textContent still joins on " · ").
  const usingParts = useMemo((): {
    filename: string | null;
    clauseLabel: string | null;
    status: string;
    statusTone: StatusTone;
  } => {
    if (!parser.activeLease) {
      return {
        filename: null,
        clauseLabel: null,
        status: 'No lease attached',
        statusTone: 'ready',
      };
    }
    const count = parser.activeLease.clause_count;
    const clauseLabel =
      typeof count === 'number'
        ? `${count} ${count === 1 ? 'clause' : 'clauses'}`
        : null;
    const [status, statusTone]: [string, StatusTone] =
      lifecycle.stage === 'review_ready'
        ? ['Scan complete', 'complete']
        : lifecycle.stage === 'idle'
          ? ['Ready', 'ready']
          : ['Scanning…', 'scanning'];
    return {
      filename: parser.activeLease.filename,
      clauseLabel,
      status,
      statusTone,
    };
  }, [parser.activeLease, lifecycle.stage]);
  const focusLabel = useMemo(() => {
    if (!fab.selection.clauseId) return null;
    // Look up the matching grading for a human-readable label
    // ("Security deposit · §4"). Falls back to the raw clauseId if
    // the grading hasn't streamed yet — better than showing nothing.
    for (const event of parser.toolEvents) {
      if (event.tool_name !== 'grade_clause_severity') continue;
      const result = event.result;
      if (
        isGradingResult(result) &&
        result.clause_id === fab.selection.clauseId
      ) {
        return clauseLabel(result);
      }
    }
    return 'Selected clause';
  }, [fab.selection.clauseId, parser.toolEvents]);

  // Sprint 29.4 — job-aware chip set + empty-state copy. Three branches:
  //   - no lease            → onboarding (LeaseLens orientation)
  //   - lease, mid-scan     → mid-scan (what the parser is doing now)
  //   - lease, review_ready → original four post-scan chips
  // The empty-state heading stays "LeaseLens Assistant" across all
  // three; only the subhead changes to mirror the chip set.
  // Sprint 33.A — chip + subhead binary choice (onboarding vs Q&A),
  // not lifecycle-driven. The chat is no longer narrating the scan
  // (the right pane owns that). `isReviewReady` is still used by the
  // pill label below, but it no longer gates the chip set.
  const isReviewReady = lifecycle.stage === 'review_ready';
  const chips: Chip[] = !parser.activeLease ? ONBOARDING_CHIPS : QA_CHIPS;
  // Sprint 38.2 — warmer, more concierge empty-state copy. Still informational
  // (no legal-advice overpromise); points at the page's dropzone in plain text,
  // never an in-chat upload control.
  const emptyStateSubhead = !parser.activeLease
    ? "Upload your NJ residential lease and I'll help explain clauses, surface possible red flags, and suggest negotiation questions."
    : 'Ask about any clause, citation, finding, or what to negotiate.';

  // Sprint 36 / 37.3 — right-size the drawer to context:
  //   no lease, no question yet  → compact-help     (small help popover)
  //   no lease, has asked        → landing-chat      (grow slightly for answers)
  //   lease attached             → workspace-drawer
  //   user-expanded (either ctx) → expanded-reading  (reading mode)
  // `canExpand` gates both the expand toggle AND the expanded-reading mode, so
  // a stale `expanded` can never strand the bare compact-help panel large
  // (e.g. if the user expands in landing-chat, then clears the thread).
  const canExpand = !!parser.activeLease || hasAskedQuestion;
  const displayMode: DisplayMode =
    expanded && canExpand
      ? 'expanded-reading'
      : parser.activeLease
        ? 'workspace-drawer'
        : hasAskedQuestion
          ? 'landing-chat'
          : 'compact-help';

  // Sprint 29.6 — FAB pill state label (lg+). Same three-way split
  // as the chip set / empty-state subhead so the user sees a
  // matching cue at the pill, in the context bar, and in the
  // empty-state copy. Mobile (<lg) keeps the icon-only pill to
  // protect thumb-area space; the aria-label always reflects the
  // current state so SR users get the same signal regardless of
  // viewport.
  const pillLabel = !parser.activeLease
    ? 'Help'
    : isReviewReady
      ? 'Ask about lease'
      : 'Scanning…';

  // Sprint 26c — restore focus to the FAB pill when the drawer closes.
  // The dialog/sheet pattern owes the user a focus return to the
  // trigger that opened it so screen-reader / keyboard navigation
  // doesn't lose its place.
  //
  // Sprint 29.9 — also move focus INTO the drawer container on open.
  // Without this, after a click the pill keeps focus and the
  // drawer's onKeyDown handler is unreachable (Escape goes to the
  // pill, which has no handler). Focusing the drawer container —
  // already `tabIndex={-1}` — puts the handler in the keystroke
  // bubble path AND fixes Tab order (next Tab from the drawer
  // goes to the first focusable child, not back out to body).
  const prevStateRef = useRef(fab.state);
  useEffect(() => {
    const prev = prevStateRef.current;
    const next = fab.state;
    if (prev !== 'closed' && next === 'closed') {
      pillRef.current?.focus();
      // Sprint 36 — collapse the reading expansion on close so the next open
      // starts at the natural per-context size. Pure size reset; the persisted
      // ChatUI draft/thread is untouched (it lives in the still-mounted DOM).
      setExpanded(false);
    }
    if (prev !== 'drawer' && next === 'drawer') {
      drawerRef.current?.focus();
    }
    prevStateRef.current = next;
  }, [fab.state]);

  // Sprint 27 — lazy-mount the drawer on first open, then keep it
  // mounted across close→open cycles so the user's typed draft and
  // active conversation survive (Don Norman: predictable interaction;
  // Jakob Nielsen: don't make the user remember hidden behavior).
  // We hide via CSS + aria-hidden + inert so screen readers and tab
  // order ignore it while closed.
  //
  // Sprint 29.9 — flipped from `useState + useEffect(setHasMountedDrawer)`
  // to a render-synchronous ref. Reason: the focus-on-open effect
  // below needs the drawer to be in the DOM on the SAME render that
  // `fab.state` becomes 'drawer'. With the old useEffect pattern,
  // the drawer mounted one render later and the focus call landed
  // on a null ref. The mutation is idempotent (only ever flips
  // false→true) so it's safe to set during render per React docs.
  const hasMountedDrawerRef = useRef(false);
  if (fab.state === 'drawer') {
    hasMountedDrawerRef.current = true;
  }
  const hasMountedDrawer = hasMountedDrawerRef.current;
  const drawerOpen = fab.state === 'drawer';

  function handlePillClick(): void {
    // Sprint 27.1 — Steve Krug / Don Norman fix: a FAB shaped like a
    // chat icon should afford chat directly. The previous menu popup
    // forced the user to choose a prefilled action before the chat
    // surface appeared. Now the pill opens the drawer immediately;
    // quick-action chips have moved inside the drawer (above the
    // composer) as suggestions.
    if (fab.state === 'closed') {
      fab.openDrawer();
    } else {
      fab.close();
    }
  }

  function handleDrawerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      fab.close();
    }
  }

  return (
    <>
      {/* Sprint 26c.10 — pill bumped from h-14/w-14 (56px) with h-6
          icon to h-16/w-16 (64px) with h-7 icon. Improves the icon-
          to-pill ratio so the affordance reads as a real primary
          action. Menu and drawer bottom-anchors shift up to keep
          the visual gap from the pill consistent.
          Sprint 29.6 — lg+ widens to a rounded pill with a visible
          state label; mobile stays icon-only. aria-label tracks the
          state label so SR users get the same signal. */}
      <button
        ref={pillRef}
        type="button"
        data-testid="assistant-fab"
        data-state={fab.state}
        aria-label={`Open assistant — ${pillLabel}`}
        aria-expanded={fab.state !== 'closed'}
        onClick={handlePillClick}
        // Sprint 38.3 — premium FAB: a warm coral gradient + an inset top
        // highlight + a soft accent-tinted drop shadow give it material depth;
        // a subtle motion-safe hover lift and an active press make it feel
        // confident and tactile (Apple HIG), never flashy (Rams). Focus ring +
        // ≥44px touch retained; reduced-motion disables the transitions.
        className="fixed right-6 bottom-6 z-overlay inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-white shadow-[0_8px_24px_-6px_rgba(204,99,71,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] transition-[translate,scale,box-shadow,background-color] duration-200 ease-out-soft hover:from-accent-600 hover:to-accent-700 motion-safe:hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 motion-reduce:transition-none dark:from-accent-500 dark:to-accent-600 dark:hover:from-accent-400 dark:hover:to-accent-500 lg:h-14 lg:w-auto lg:gap-2 lg:px-5"
      >
        <MessageCircle className="h-7 w-7 lg:h-5 lg:w-5" aria-hidden="true" />
        <span
          data-testid="assistant-fab-pill-label"
          className="hidden text-sm font-medium lg:inline"
        >
          {pillLabel}
        </span>
      </button>

      {/* Sprint 27.1 — the standalone menu popup is gone. CHIPS now flow
          into the drawer as `suggestedPrompts` (rendered above the
          composer when the transcript is empty). `fab.openMenu` /
          `state === 'menu'` are still exported by AssistantFabContext
          for any future surface that wants the popup pattern, but the
          pill no longer triggers it. */}

      {hasMountedDrawer ? (
        <div
          ref={drawerRef}
          data-testid="assistant-fab-drawer"
          data-state={fab.state}
          data-display-mode={displayMode}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          aria-hidden={drawerOpen ? undefined : true}
          // Sprint 38.8 — per-property transition durations (see
          // DRAWER_RESIZE_TIMING): snappy open/close, gentler resize. Tailwind
          // can't express per-property durations, so they're set inline; the
          // transition-property + easing still come from DRAWER_MOTION.
          style={{ transitionDuration: DRAWER_RESIZE_TIMING }}
          // `inert` removes the subtree from the tab order and a11y
          // tree while the drawer is hidden. Sprint 27.1 — React 19
          // emits a console warning for the legacy `inert=""` idiom
          // ("Received an empty string for a boolean attribute"),
          // AND silently strips it from the DOM (so the drawer wasn't
          // actually inert when closed). Pass a real boolean `true`
          // instead; omit entirely when the drawer is open. We still
          // cast through `any` because the ambient JSX types lag
          // behind in some installs.
          // biome-ignore lint/suspicious/noExplicitAny: inert attr typing
          {...({ inert: drawerOpen ? undefined : true } as any)}
          tabIndex={-1}
          onKeyDown={handleDrawerKeyDown}
          // Sprint 36 — size is now derived per displayMode (SIZE_BY_MODE) +
          // a shared mobile-safe suffix; the invariant prefix keeps anchor /
          // layout / overflow unchanged so focus + persistence are untouched.
          // Visual lightening (Refactoring UI / Rams): the heavy
          // `border border-neutral-200` + `shadow-xl` became the hairline
          // token border + a soft shadow — a calm support layer, not a
          // debug modal. `border-border-hairline` auto-flips at :root.dark, so
          // no per-class dark border. (Two `shadow-*` utilities can't stack —
          // they share box-shadow — so the hairline is a border, not a shadow.)
          // Sprint 37.1 — `shadow-lg` (generic black bloom) → `shadow-popover`,
          // a warm, layered shadow tinted to the palette so the popover reads
          // premium rather than like a generic modal.
          // Sprint 38.2 — premium concierge material: 24px radius (rounded-3xl);
          // translucent warm parchment + backdrop-blur so the landing shows
          // softly through the chrome (the content layer stays opaque enough to
          // hold WCAG-AA body text — opacity wins over blur); a 1px inner top
          // highlight (`before:` gradient line) for material depth. The hairline
          // border + warm shadow stay. `supports-[backdrop-filter]` keeps a more
          // opaque fallback where backdrop-blur isn't available.
          className={`fixed right-6 bottom-28 z-overlay flex flex-col overflow-hidden rounded-[24px] border border-border-hairline bg-surface-card/85 shadow-popover backdrop-blur-xl supports-[backdrop-filter]:bg-surface-card/75 dark:bg-neutral-900/85 dark:supports-[backdrop-filter]:bg-neutral-900/75 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/55 before:to-transparent before:content-[''] dark:before:via-white/10 ${DRAWER_MOTION} ${SIZE_BY_MODE[displayMode]} ${MOBILE_SAFE_SIZE} ${
            drawerOpen
              ? 'translate-y-0 scale-100 opacity-100'
              : 'pointer-events-none translate-y-3 scale-95 opacity-0'
          }`}
        >
          {/* Sprint 38.2 — branded concierge header: the LeaseLens mark + a
              two-line identity (name over role) reads as "your LeaseLens
              assistant", not a generic chat label. Transparent + divider-free
              so it sits on the panel's parchment glass as one continuous
              material (Rams: fewer hard lines; hierarchy via type + space). */}
          <header className="flex shrink-0 items-start justify-between gap-2 px-4 pt-4 pb-2.5">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300"
              >
                <LeaseLensMark size={20} animated={false} />
              </span>
              <div className="flex flex-col">
                {/* "Assistant" stays the brand's one-italic-emphasis word. */}
                <h2
                  id={headingId}
                  className="font-serif text-[15px] font-bold leading-tight tracking-tight text-fg-default"
                >
                  LeaseLens{' '}
                  <span className="font-normal italic">Assistant</span>
                </h2>
                <span className="text-[11px] leading-tight text-fg-muted">
                  NJ tenant-law guidance
                </span>
              </div>
            </div>
            {/* Sprint 36 / 37.3 — expand/collapse into reading mode, shown when
                `canExpand` (lease attached OR a thread exists pre-upload).
                Sprint 38.2 — circular icon button to match the close button's
                refined treatment; keeps the 44px touch target + focus ring. */}
            <div className="flex items-center gap-1">
              {canExpand ? (
                <button
                  type="button"
                  data-testid="assistant-fab-expand"
                  aria-label={
                    expanded ? 'Collapse assistant' : 'Expand assistant'
                  }
                  aria-pressed={expanded}
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 motion-reduce:transition-none dark:hover:bg-neutral-800"
                >
                  {expanded ? (
                    <Minimize2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              ) : null}
              <button
                type="button"
                data-testid="assistant-fab-close"
                aria-label="Close assistant"
                onClick={() => fab.close()}
                // Sprint 29.7 — 44×44 touch target (WCAG 2.5.5 / iOS HIG).
                // Sprint 38.2 — circular icon button (premium concierge chrome).
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:hover:bg-neutral-800"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>
          {/* Sprint 29.3 — assistant context bar. Names what the
              assistant is attached to (filename + clause count + scan
              stage) and, when the user has focused on a specific
              clause, surfaces a detach × so they can drop the clause
              focus without losing their typed draft (Don Norman:
              show state; Steve Krug: don't make the user think). */}
          {/* Sprint 38.2 — status pill (replaces the debug-like "USING:" row).
              Divider-free + transparent so it sits on the panel's parchment
              glass as one continuous material. The status reads as a human
              chip: a hollow ○ when no lease is attached (+ a quiet text hint to
              upload in the dropzone — there is NO in-chat upload control), or a
              filled ● radar (tinted by scan tone, motion-safe) + "Lease
              attached: <file>" once a lease is loaded. The dot is always paired
              with text, never colour-only (WCAG). */}
          <div
            data-testid="assistant-context-bar"
            className="flex shrink-0 flex-col gap-1.5 px-4 py-2.5 text-[12px]"
          >
            {usingParts.filename ? (
              // Lease attached — a filled radar dot leads the row (the masthead
              // two-layer animate-ping, tinted by scan tone, motion-safe), then
              // "Lease attached: <file> · N clauses · <scan status>". The dot
              // carries tone + liveness; the trailing status word is its WCAG
              // text pairing (never colour-only).
              <div className="flex items-baseline gap-2">
                <span
                  data-testid="assistant-using-status-dot"
                  aria-hidden="true"
                  className="relative inline-flex h-2 w-2 shrink-0 translate-y-px"
                >
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping ${STATUS_DOT[usingParts.statusTone]}`}
                  />
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${STATUS_DOT[usingParts.statusTone]}`}
                  />
                </span>
                <span className="truncate">
                  <span className="text-fg-muted">Lease attached: </span>
                  <span className="font-mono text-fg-default">
                    {usingParts.filename}
                  </span>
                  {usingParts.clauseLabel ? (
                    <span className="text-fg-muted tabular-nums">
                      {' '}
                      · {usingParts.clauseLabel}
                    </span>
                  ) : null}
                  <span className="text-fg-muted"> · {usingParts.status}</span>
                </span>
              </div>
            ) : (
              // No lease — a hollow ring dot + "No lease attached" + a quiet
              // text hint pointing at the page's dropzone (no in-chat upload).
              <div className="flex items-start gap-2">
                <span
                  data-testid="assistant-using-status-dot"
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full border border-fg-subtle"
                />
                <div className="flex flex-col gap-0.5">
                  <span className="text-fg-default">No lease attached</span>
                  {/* Sprint 38.4 — fg-muted (not fg-subtle) so the hint holds
                      WCAG-AA contrast (~6.6:1) over the parchment glass. */}
                  <span className="text-[11px] leading-snug text-fg-muted">
                    Upload one in the dropzone for clause-specific help.
                  </span>
                </div>
              </div>
            )}
            {focusLabel ? (
              <div
                data-testid="assistant-context-bar-focus"
                className="flex items-baseline gap-2"
              >
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                  Focused on:
                </span>
                <span className="truncate text-fg-default">{focusLabel}</span>
                <button
                  type="button"
                  data-testid="assistant-context-bar-detach"
                  aria-label="Detach clause"
                  onClick={() => fab.detachSelection()}
                  // Sprint 29.7 — 28×28 → 44×44 touch target. The
                  // small X glyph (h-3.5 w-3.5) keeps the visual
                  // unobtrusive inside the context bar; the button
                  // just expands its hit area.
                  className="ml-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:hover:bg-neutral-800"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ChatUI
              workspaceName={workspaceName}
              conversationId={conversationId}
              initialMessages={initialMessages}
              onToolEvent={onToolEvent}
              initialComposerText={fab.pendingPrompt ?? undefined}
              suggestedPrompts={chips.map((chip) => ({
                id: chip.id,
                label: chip.label,
                prompt: chip.prompt,
                disabled: !chip.enabled(chipContext),
              }))}
              onSelectSuggestion={(prompt) =>
                fab.openWith({ initialPrompt: prompt })
              }
              // Sprint 29.2 — drawer suppresses the full ChatEmptyState
              // hero and uses the compact in-drawer header. Without this
              // the assistant feels like a second homepage; with it the
              // FAB drawer reads as a focused support tool.
              // Sprint 29.4 — subhead derived from parser lifecycle so
              // the empty-state copy stays in lockstep with the chip
              // row (no-lease / mid-scan / scan-complete branches).
              emptyStateVariant="compact"
              emptyStateSubhead={emptyStateSubhead}
              // Sprint 37.1 / 38.2 — state-aware placeholder: a general-help
              // prompt before a lease is attached, a clause-specific prompt
              // after. Both explicit so the copy matches the brief exactly
              // (the ChatComposer default is only used by non-FAB mounts).
              composerPlaceholder={
                parser.activeLease
                  ? 'Ask about a clause, fee, deposit, or red flag…'
                  : 'Ask a general question about NJ leases…'
              }
              // Sprint 37.3 — track whether a thread exists (drives
              // landing-chat) and let a long answer jump to expanded-reading.
              // onRequestExpandedReading is passed only when NOT already
              // expanded, so the "Read in full view" affordance hides in
              // expanded-reading mode.
              onHasMessagesChange={setHasAskedQuestion}
              onRequestExpandedReading={
                expanded ? undefined : () => setExpanded(true)
              }
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
