'use client';

/*
 * Sprint 29.3 → 55.1 — assistant context bar (pure presenter).
 *
 * Names what the assistant is attached to (filename + clause count + scan
 * stage) and, when the user has focused on a specific clause, surfaces a
 * detach × so they can drop the clause focus without losing their typed
 * draft (Don Norman: show state; Steve Krug: don't make the user think).
 *
 * Sprint 55.1 — extracted from AssistantFab.client.tsx as a presenter. It
 * receives `usingParts` / `focusLabel` already derived by the FAB (which owns
 * the parser + fab context) and an `onDetach` callback, so it never reaches
 * across providers itself (Robert C. Martin: split presentation from
 * orchestration/state). The `assistant-context-bar*` testids + the 44px detach
 * target are unchanged.
 */

import { X } from 'lucide-react';

// Sprint 36.3 — scan-status dot, reusing the masthead "● LIVE" vocabulary.
// Always paired with the status word, so colour is never the only signal.
export type StatusTone = 'complete' | 'scanning' | 'ready';
const STATUS_DOT: Record<StatusTone, string> = {
  complete: 'bg-success-600',
  scanning: 'bg-accent-500',
  ready: 'bg-neutral-400 dark:bg-neutral-500',
};

// Sprint 36.2 — a mono filename (a technical identifier per MASTER.md) + muted
// metadata (clause count · scan stage), so the bar reads identity → metadata
// instead of one flat prototype-y run. `filename` is null when no lease, in
// which case the no-lease branch carries the "No lease attached" sentence.
export interface AssistantContextUsingParts {
  filename: string | null;
  clauseLabel: string | null;
  status: string;
  statusTone: StatusTone;
}

export interface AssistantContextBarProps {
  usingParts: AssistantContextUsingParts;
  /**
   * Human-readable label of the focused clause ("Security deposit · §4"), or
   * null when no clause is focused — in which case the focus row + detach ×
   * disappear.
   */
  focusLabel: string | null;
  onDetach: () => void;
}

// Sprint 38.2 — status pill (replaces the debug-like "USING:" row). Divider-free
// + transparent so it sits on the panel's parchment glass as one continuous
// material. The status reads as a human chip: a hollow ○ when no lease is
// attached (+ a quiet text hint to upload in the dropzone — there is NO in-chat
// upload control), or a filled ● radar (tinted by scan tone, motion-safe) +
// "Lease attached: <file>" once a lease is loaded. The dot is always paired with
// text, never colour-only (WCAG).
// Sprint 52.1 — folded into the masthead <header> in the FAB and stripped of its
// own py-2.5 block so brand + status read as one slim zone, not two stacked
// strips.
export function AssistantContextBar({
  usingParts,
  focusLabel,
  onDetach,
}: AssistantContextBarProps): React.JSX.Element {
  return (
    <div
      data-testid="assistant-context-bar"
      className="flex flex-col gap-1 text-[12px]"
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
            onClick={onDetach}
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
  );
}
