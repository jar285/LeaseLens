// Sprint 46.3 — PDF highlight UI state (visibility / severity filter / hover).
//
// Owns the state that is genuinely NEW to the highlight feature:
//   - showHighlights: master on/off for the PDF overlay
//   - severityFilter: which severities are drawn (default High+Medium per
//     the user decision — Low/OK are opt-in to avoid a busy document)
//   - hoveredClauseId: the bidirectional hover channel between a red-flag
//     card and its PDF highlight (PDF→card AND card→PDF)
//
// Deliberately separate from LeaseParserContext (which owns parser DATA:
// activeLease, toolEvents, activeClauseId, pdfViewerRef) so PDF-presentation
// state doesn't couple to red-flag data state — and separate from
// ChatStreamContext, whose chat-only key surface is pinned by a test.
// CLICK focus reuses the existing activeClauseId; only visibility/filter/
// hover are new, so only those live here.

'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { Severity } from './grading';

export type SeverityFilter = Record<Severity, boolean>;

// Default per the confirmed product decision: highlight the things that
// matter (High + Medium) on load; Low/OK are a deliberate opt-in toggle.
export const DEFAULT_SEVERITY_FILTER: SeverityFilter = {
  high: true,
  medium: true,
  low: false,
  ok: false,
};

interface PdfHighlightContextValue {
  showHighlights: boolean;
  severityFilter: SeverityFilter;
  hoveredClauseId: string | null;
  setShowHighlights: (value: boolean) => void;
  toggleSeverity: (severity: Severity) => void;
  setHoveredClauseId: (id: string | null) => void;
  /** True when the master toggle is on AND this severity passes the filter. */
  isSeverityVisible: (severity: Severity) => boolean;
}

const PdfHighlightContext = createContext<PdfHighlightContextValue | null>(
  null,
);

export function PdfHighlightProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [showHighlights, setShowHighlights] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>(
    DEFAULT_SEVERITY_FILTER,
  );
  const [hoveredClauseId, setHoveredClauseId] = useState<string | null>(null);

  const toggleSeverity = useCallback((severity: Severity) => {
    setSeverityFilter((prev) => ({ ...prev, [severity]: !prev[severity] }));
  }, []);

  const isSeverityVisible = useCallback(
    (severity: Severity) => showHighlights && severityFilter[severity],
    [showHighlights, severityFilter],
  );

  const value = useMemo<PdfHighlightContextValue>(
    () => ({
      showHighlights,
      severityFilter,
      hoveredClauseId,
      setShowHighlights,
      toggleSeverity,
      setHoveredClauseId,
      isSeverityVisible,
    }),
    [
      showHighlights,
      severityFilter,
      hoveredClauseId,
      toggleSeverity,
      isSeverityVisible,
    ],
  );

  return (
    <PdfHighlightContext.Provider value={value}>
      {children}
    </PdfHighlightContext.Provider>
  );
}

export function useHighlightSettings(): PdfHighlightContextValue {
  const ctx = useContext(PdfHighlightContext);
  if (!ctx) {
    throw new Error(
      'useHighlightSettings must be called inside <PdfHighlightProvider>.',
    );
  }
  return ctx;
}
