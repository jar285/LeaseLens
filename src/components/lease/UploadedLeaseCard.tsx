'use client';

/*
 * Sprint 23c Phase 2 — visual card that replaces the synthetic
 * "Lease uploaded" intro message in the chat transcript.
 *
 * The synthetic intro is still produced by `computeScanNarrative()` in
 * scan-narrative.ts; ChatTranscript detects it (synthetic + source ===
 * 'intro') and routes the rendering here instead of through the regular
 * ChatMessage path. This gives the upload moment a distinct visual
 * register: the filename in a mono accent span, "N pages · M clauses"
 * meta, a paragraph body, and four action chips on a sunken surface as
 * the call-to-action.
 *
 * Sprint 23c Phase 5 (polish addendum) — fades the card in on mount
 * with a 250ms opacity + 8px y-translate so it doesn't pop in
 * instantly when the upload parse completes. Matches the entry-
 * animation budget used by ChatEmptyState card stagger + ChatMessage
 * (250ms, ease-out-soft curve). Reduced motion renders plain DOM.
 *
 * Pure presentation. Props in, JSX out. The card owns no state beyond
 * the mount-flag used to gate the entry animation against SSR.
 */

import { ScrollText } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { FollowUpPrompt } from '@/lib/chat/follow-up-prompts';

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export interface UploadedLeaseCardProps {
  filename: string;
  pageCount?: number;
  clauseCount?: number;
  prompts: FollowUpPrompt[];
  onSelectPrompt: (prompt: string) => void;
}

// Sprint 23c Phase 5 — entry transition.
//
// 350ms is the upper end of the LeaseLens motion budget (--duration-350
// token); paired with a 16px y-translate it gives the card a deliberate
// "settling in" feel instead of the near-instant 250ms+8px first pass
// (which the user perceived as a pop). The ease-out-soft curve front-
// loads the motion so the card decelerates into place.
const ENTRY_INITIAL = { opacity: 0, y: 16 } as const;
const ENTRY_ANIMATE = { opacity: 1, y: 0 } as const;
const ENTRY_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
} as const;

export function UploadedLeaseCard({
  filename,
  pageCount,
  clauseCount,
  prompts,
  onSelectPrompt,
}: UploadedLeaseCardProps): React.JSX.Element {
  const hasMeta =
    typeof pageCount === 'number' && typeof clauseCount === 'number';
  // No mount-flag gate here on purpose: UploadedLeaseCard only renders
  // client-side (it appears when activeLease is set, which happens
  // after the upload-parse round-trip — never during SSR). The earlier
  // mounted/useEffect pattern caused a first-paint pop because the
  // plain-DOM fallback rendered on tick 1 and motion.div swapped in on
  // tick 2, by which point the user had already seen the card. Going
  // straight to motion.div lets the `initial` state render on the very
  // first paint and the animation proceed deterministically.
  const reduced = useReducedMotion();

  const cardClassName =
    'my-4 overflow-hidden rounded-xl border border-neutral-200 bg-surface-elevated shadow-hairline dark:border-neutral-800';

  const cardInner = (
    <>
      {/* Card body — filename + meta + paragraph */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300"
          >
            <ScrollText className="h-3.5 w-3.5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[13px] font-medium text-fg-default">
              {filename}
            </p>
            {hasMeta ? (
              <p className="mt-0.5 text-[11px] leading-tight text-fg-muted">
                {pluralize(pageCount as number, 'page')}
                <span aria-hidden="true"> · </span>
                {pluralize(clauseCount as number, 'clause')}
              </p>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-fg-default">
          I can run a standard scan to extract every clause, grade each against
          NJ tenant-law sources, and surface the red flags in the right panel.
          If you want, I can also explain a single clause, compare your lease to
          NJ law, or draft a negotiation email — pick whatever fits where you
          are right now.
        </p>
      </div>

      {/* Action chips — visually separated on bg-surface-sunken so the
          card body and the call-to-action read as distinct registers. */}
      <div className="flex flex-wrap gap-2 border-t border-neutral-100 bg-surface-sunken px-5 py-3 dark:border-neutral-800">
        {prompts.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => onSelectPrompt(chip.prompt)}
            className="inline-flex min-h-9 cursor-pointer items-center rounded-md border border-neutral-200 bg-surface-card px-3 text-[12px] font-medium text-fg-default transition-colors hover:border-accent-300 hover:bg-accent-50/40 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-1 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-accent-400/40 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </>
  );

  if (reduced) {
    return (
      <div
        data-testid="uploaded-lease-card"
        data-motion="off"
        className={cardClassName}
      >
        {cardInner}
      </div>
    );
  }

  return (
    <motion.div
      data-testid="uploaded-lease-card"
      data-motion="on"
      className={cardClassName}
      initial={ENTRY_INITIAL}
      animate={ENTRY_ANIMATE}
      transition={ENTRY_TRANSITION}
    >
      {cardInner}
    </motion.div>
  );
}
