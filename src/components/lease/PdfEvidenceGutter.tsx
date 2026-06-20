'use client';

// Sprint 48.2 — Turnitin-style evidence gutter.
//
// Small, subtle, clickable severity markers down the right padding gutter of
// the PDF, one per VISIBLE red-flagged clause, vertically aligned to the
// clause. They let the user scan a long lease for issues without needing
// heavy highlights on every line — and clicking one focuses that clause
// (sets activeClauseId → the viewer scrolls + frames it).
//
// Like the evidence frame, markers are positioned in the scroll section's
// CONTENT space and rendered as direct absolute children of the section, so
// they scroll with the pages automatically — no scroll listener needed; we
// only re-measure when the clause set, the filter, or the zoom changes.

import { type RefObject, useCallback, useLayoutEffect, useState } from 'react';
import { clauseLabel, SEVERITY_CONCERN, type Severity } from './grading';
import { useLeaseParser } from './LeaseParserContext';
import { useHighlightSettings } from './PdfHighlightContext';
import { useClauseHighlights } from './use-clause-highlights';

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

// Severity shape glyphs (same language as the highlight's leading glyph and
// the SeverityBadge icon) so the marker never relies on colour alone.
const SEVERITY_GLYPH: Record<Severity, string> = {
  high: '▲',
  medium: '◆',
  low: '●',
  ok: '✓',
};

interface GutterMarker {
  clauseId: string;
  severity: Severity;
  label: string;
  /** Vertical center of the clause, in section content-space px. */
  top: number;
}

export function PdfEvidenceGutter({
  scrollAreaRef,
  effectivePageWidth,
}: {
  scrollAreaRef: RefObject<HTMLElement | null>;
  effectivePageWidth: number;
}): React.JSX.Element | null {
  const { setActiveClauseId } = useLeaseParser();
  const { byPage } = useClauseHighlights();
  const { showHighlights, isSeverityVisible } = useHighlightSettings();
  const [markers, setMarkers] = useState<GutterMarker[]>([]);

  const recompute = useCallback(() => {
    const root = scrollAreaRef.current;
    if (!root || !showHighlights) {
      setMarkers([]);
      return;
    }
    const sectionRect = root.getBoundingClientRect();
    const next: GutterMarker[] = [];
    for (const targets of byPage.values()) {
      for (const target of targets) {
        if (!isSeverityVisible(target.severity)) continue;
        // Align to the clause's FIRST fragment (its start).
        const mark = root.querySelector<HTMLElement>(
          `mark[data-clause-id="${cssEscape(target.clauseId)}"]`,
        );
        if (!mark) continue;
        const r = mark.getBoundingClientRect();
        const top = r.top - sectionRect.top + root.scrollTop + r.height / 2;
        next.push({
          clauseId: target.clauseId,
          severity: target.severity,
          label: `${clauseLabel({
            clause_type: target.clauseType,
            clause_index: target.clauseIndex,
          })} · ${SEVERITY_CONCERN[target.severity]}`,
          top,
        });
      }
    }
    next.sort((a, b) => a.top - b.top);
    setMarkers(next);
  }, [scrollAreaRef, showHighlights, byPage, isSeverityVisible]);

  // Content-space markers scroll with the pages on their own; only re-measure
  // when the clause set / filter / zoom changes. effectivePageWidth is a
  // deliberate re-measure trigger (zoom re-renders pages at a new width).
  // biome-ignore lint/correctness/useExhaustiveDependencies: effectivePageWidth is a re-measure trigger, not a read value.
  useLayoutEffect(() => {
    recompute();
  }, [recompute, effectivePageWidth]);

  if (markers.length === 0) return null;

  // Direct absolute children of the scroll section (NOT a wrapping inset
  // container, which would pin to the viewport): `top` is content-space so
  // each marker scrolls with its clause; `right` pins it to the gutter edge.
  return (
    <>
      {markers.map((marker) => (
        <button
          key={marker.clauseId}
          type="button"
          data-testid="pdf-evidence-gutter-marker"
          data-clause-id={marker.clauseId}
          data-severity={marker.severity}
          aria-label={`Jump to ${marker.label}`}
          onClick={() => setActiveClauseId(marker.clauseId)}
          style={{ position: 'absolute', top: marker.top, right: 4 }}
          className={`ll-gutter-marker ll-gutter-marker--${marker.severity} z-overlay`}
        >
          <span aria-hidden="true">{SEVERITY_GLYPH[marker.severity]}</span>
        </button>
      ))}
    </>
  );
}
