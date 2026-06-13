'use client';

// Sprint 47.2 — premium "evidence frame" overlay.
//
// The passive highlight tint lives on the inline text-layer marks (calm,
// readable, zoom/scroll-free). For the ACTIVE (and hovered) clause we add a
// single cohesive frame — one rounded rect spanning the whole clause — that
// carries the halo + glow (and, in 47.3, the floating label). Drawing the
// emphasis here (instead of per-mark box-shadows) avoids the stack-of-boxes
// look on multi-line clauses.
//
// Positioning: the frames are computed in the SCROLL SECTION's content
// coordinate space and rendered as DIRECT absolute children of that section
// (its own containing block + scroll container) so they scroll with the
// pages. They must NOT be wrapped in an `absolute inset-0` box — that would
// pin them to the viewport and they'd drift on scroll. At most two frames
// exist at once (active + hovered), so recomputing on scroll/zoom is cheap.

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { clauseLabel, SEVERITY_CONCERN, type Severity } from './grading';
import { useLeaseParser } from './LeaseParserContext';
import { useHighlightSettings } from './PdfHighlightContext';
import { useClauseHighlights } from './use-clause-highlights';

// Local copy of the selector escape (PdfViewer keeps its own); ids are
// server slugs but we escape defensively for the attribute selector.
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

// A little breathing room around the text so the frame reads as a calm
// region marker, not a tight box.
const FRAME_PAD = 3;

interface EvidenceFrame {
  clauseId: string;
  severity: Severity;
  label: string;
  variant: 'active' | 'hover';
  top: number;
  left: number;
  width: number;
  height: number;
}

export function PdfEvidenceOverlay({
  scrollAreaRef,
  effectivePageWidth,
}: {
  scrollAreaRef: RefObject<HTMLElement | null>;
  effectivePageWidth: number;
}): React.JSX.Element | null {
  const { activeClauseId } = useLeaseParser();
  const { hoveredClauseId } = useHighlightSettings();
  const { byPage } = useClauseHighlights();
  const [frames, setFrames] = useState<EvidenceFrame[]>([]);

  const metaFor = useCallback(
    (clauseId: string): { severity: Severity; label: string } | null => {
      for (const targets of byPage.values()) {
        const target = targets.find((t) => t.clauseId === clauseId);
        if (target) {
          // Sprint 48.1 — label now reads "Late fee · §3 · High concern" so
          // the pill carries severity in TEXT (not colour alone).
          const base = clauseLabel({
            clause_type: target.clauseType,
            clause_index: target.clauseIndex,
          });
          return {
            severity: target.severity,
            label: `${base} · ${SEVERITY_CONCERN[target.severity]}`,
          };
        }
      }
      return null;
    },
    [byPage],
  );

  const recompute = useCallback(() => {
    const root = scrollAreaRef.current;
    if (!root) {
      setFrames([]);
      return;
    }
    const sectionRect = root.getBoundingClientRect();

    const build = (
      clauseId: string | null,
      variant: 'active' | 'hover',
    ): EvidenceFrame | null => {
      if (!clauseId) return null;
      const marks = root.querySelectorAll<HTMLElement>(
        `mark[data-clause-id="${cssEscape(clauseId)}"]`,
      );
      if (marks.length === 0) return null;
      const meta = metaFor(clauseId);
      if (!meta) return null;

      // Union bounding box across all of the clause's mark fragments, in
      // the section's content coordinate space (survives scroll).
      let minTop = Number.POSITIVE_INFINITY;
      let minLeft = Number.POSITIVE_INFINITY;
      let maxRight = Number.NEGATIVE_INFINITY;
      let maxBottom = Number.NEGATIVE_INFINITY;
      for (const mark of marks) {
        const r = mark.getBoundingClientRect();
        const top = r.top - sectionRect.top + root.scrollTop;
        const left = r.left - sectionRect.left + root.scrollLeft;
        minTop = Math.min(minTop, top);
        minLeft = Math.min(minLeft, left);
        maxRight = Math.max(maxRight, left + r.width);
        maxBottom = Math.max(maxBottom, top + r.height);
      }
      return {
        clauseId,
        severity: meta.severity,
        label: meta.label,
        variant,
        top: minTop - FRAME_PAD,
        left: minLeft - FRAME_PAD,
        width: maxRight - minLeft + FRAME_PAD * 2,
        height: maxBottom - minTop + FRAME_PAD * 2,
      };
    };

    const next: EvidenceFrame[] = [];
    const active = build(activeClauseId, 'active');
    if (active) next.push(active);
    if (hoveredClauseId && hoveredClauseId !== activeClauseId) {
      const hover = build(hoveredClauseId, 'hover');
      if (hover) next.push(hover);
    }
    setFrames(next);
  }, [scrollAreaRef, activeClauseId, hoveredClauseId, metaFor]);

  // Recompute on selection change and on zoom. effectivePageWidth isn't
  // read in the body — it's an intentional re-run trigger: a zoom change
  // re-renders the pages at a new width, so the frame must re-measure.
  // biome-ignore lint/correctness/useExhaustiveDependencies: effectivePageWidth is a deliberate re-measure trigger, not a read value.
  useLayoutEffect(() => {
    recompute();
  }, [recompute, effectivePageWidth]);

  // Track scroll while something is emphasized (rAF-throttled, listeners
  // only attached when there's an active/hovered clause to follow).
  useEffect(() => {
    const root = scrollAreaRef.current;
    if (!root || (!activeClauseId && !hoveredClauseId)) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        recompute();
      });
    };
    root.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [scrollAreaRef, activeClauseId, hoveredClauseId, recompute]);

  if (frames.length === 0) return null;

  return (
    <>
      {frames.map((frame) => (
        <div
          key={`${frame.variant}-${frame.clauseId}`}
          data-testid="pdf-evidence-frame"
          data-clause-id={frame.clauseId}
          data-severity={frame.severity}
          data-variant={frame.variant}
          aria-hidden="true"
          className={`ll-evidence-frame ll-evidence-frame--${frame.severity} ll-evidence-frame--${frame.variant} z-raised`}
          style={{
            position: 'absolute',
            top: frame.top,
            left: frame.left,
            width: frame.width,
            height: frame.height,
          }}
        >
          {/* Sprint 47.3 — floating evidence label, a caption pill above the
              clause's first line. Shown only for the emphasized clause(s).
              aria-hidden: the mark's aria-label + the card already name it. */}
          <span
            data-testid="pdf-evidence-label"
            data-clause-id={frame.clauseId}
            className="ll-evidence-label"
          >
            {frame.label}
          </span>
        </div>
      ))}
    </>
  );
}
