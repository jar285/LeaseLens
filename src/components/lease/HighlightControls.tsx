'use client';

// Sprint 46.7 — highlight visibility + severity-filter controls.
//
// Governs WHICH red flags are evidenced on the PDF, so it lives above the
// cards (in the red-flags pane header), not in the stateless PDF toolbar
// (which renders twice — inline + Focus — and would duplicate the control).
//
// Master show/hide toggle + four severity chips. Each chip is a
// SeverityBadge (icon + text + colour) so the filter never relies on colour
// alone; aria-pressed conveys on/off; min-h-11 keeps touch targets ≥44px; a
// polite aria-live status announces visibility changes for screen readers.
// Self-gates on "are there graded highlights" so it never appears before a
// scan completes.

import { Eye, EyeOff } from 'lucide-react';
import { SEVERITY_LABEL, SEVERITY_ORDER } from './grading';
import { useHighlightSettings } from './PdfHighlightContext';
import { SeverityBadge } from './SeverityBadge';
import { useClauseHighlights } from './use-clause-highlights';

export function HighlightControls(): React.JSX.Element | null {
  const { count } = useClauseHighlights();
  const { showHighlights, setShowHighlights, severityFilter, toggleSeverity } =
    useHighlightSettings();

  // Only meaningful once the scan has produced graded clauses to highlight.
  if (count === 0) return null;

  const visibleSummary = SEVERITY_ORDER.filter((s) => severityFilter[s])
    .map((s) => SEVERITY_LABEL[s])
    .join(', ');

  return (
    <div
      data-testid="highlight-controls"
      className="flex flex-wrap items-center justify-end gap-1.5"
    >
      {/* Sprint 54 — name the control's scope. Without it the toggle + chips
          read as if they might filter the CARDS; this makes clear they govern
          the PDF highlights (Nielsen: label the control; Steve Krug: don't make
          me guess). Hidden on the tightest widths; fg-muted clears AA. */}
      <span
        data-testid="highlight-controls-label"
        className="hidden text-[10px] font-medium uppercase tracking-wider text-fg-muted sm:inline"
      >
        Highlight on PDF
      </span>
      <button
        type="button"
        data-testid="highlight-toggle"
        aria-pressed={showHighlights}
        aria-label={showHighlights ? 'Hide highlights' : 'Show highlights'}
        onClick={() => setShowHighlights(!showHighlights)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 text-[11px] font-medium text-fg-default transition-colors hover:border-accent-300 hover:bg-accent-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-1 aria-pressed:border-accent-300 aria-pressed:bg-accent-50/60 aria-pressed:text-accent-700 dark:border-neutral-700 dark:hover:bg-accent-500/10 dark:aria-pressed:bg-accent-500/15 dark:aria-pressed:text-accent-200"
      >
        {showHighlights ? (
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Highlights
      </button>

      <fieldset
        aria-label="Filter highlights by severity"
        className="m-0 flex min-w-0 items-center gap-1 border-0 p-0"
      >
        {SEVERITY_ORDER.map((severity) => (
          <button
            key={severity}
            type="button"
            data-testid={`highlight-filter-${severity}`}
            aria-pressed={severityFilter[severity]}
            aria-label={`${SEVERITY_LABEL[severity]} highlights`}
            disabled={!showHighlights}
            onClick={() => toggleSeverity(severity)}
            className={`inline-flex min-h-11 items-center rounded-full px-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 ${
              severityFilter[severity]
                ? 'opacity-100 ring-1 ring-accent-300/45 dark:ring-accent-400/30'
                : 'opacity-45 ring-1 ring-transparent'
            }`}
          >
            <SeverityBadge severity={severity} size="sm" />
          </button>
        ))}
      </fieldset>

      <span
        data-testid="highlight-status"
        aria-live="polite"
        className="sr-only"
      >
        {showHighlights
          ? `Highlights on. Showing ${visibleSummary || 'none'}.`
          : 'Highlights off.'}
      </span>
    </div>
  );
}
