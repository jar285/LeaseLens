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
 * Pure presentation. Props in, JSX out. The card owns no state.
 */

import { ScrollText } from 'lucide-react';
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

export function UploadedLeaseCard({
  filename,
  pageCount,
  clauseCount,
  prompts,
  onSelectPrompt,
}: UploadedLeaseCardProps): React.JSX.Element {
  const hasMeta =
    typeof pageCount === 'number' && typeof clauseCount === 'number';

  return (
    <div
      data-testid="uploaded-lease-card"
      className="my-4 overflow-hidden rounded-xl border border-neutral-200 bg-surface-elevated shadow-hairline dark:border-neutral-800"
    >
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
    </div>
  );
}
