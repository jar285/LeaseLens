// Sprint 46.3 — PDF highlight UI state (visibility / severity filter / hover).
//
// New, genuinely-new state for the highlight feature lives here, NOT on
// LeaseParserContext (which owns parser DATA) and NOT on ChatStreamContext
// (chat-only; its exposed-keys boundary is pinned by a separate test).
// Click-focus reuses the existing activeClauseId on LeaseParserContext —
// only visibility/filter/hover are new, so only those live here.

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEVERITY_FILTER,
  PdfHighlightProvider,
  useHighlightSettings,
} from './PdfHighlightContext';

function wrapper({ children }: { children: ReactNode }) {
  return <PdfHighlightProvider>{children}</PdfHighlightProvider>;
}

describe('PdfHighlightContext', () => {
  it('defaults to highlights on, High+Medium visible, Low/OK hidden, no hover', () => {
    const { result } = renderHook(() => useHighlightSettings(), { wrapper });
    expect(result.current.showHighlights).toBe(true);
    expect(result.current.severityFilter).toEqual(DEFAULT_SEVERITY_FILTER);
    expect(result.current.severityFilter).toEqual({
      high: true,
      medium: true,
      low: false,
      ok: false,
    });
    expect(result.current.hoveredClauseId).toBeNull();
  });

  it('toggles master visibility', () => {
    const { result } = renderHook(() => useHighlightSettings(), { wrapper });
    act(() => result.current.setShowHighlights(false));
    expect(result.current.showHighlights).toBe(false);
  });

  it('toggles a single severity in the filter', () => {
    const { result } = renderHook(() => useHighlightSettings(), { wrapper });
    act(() => result.current.toggleSeverity('low'));
    expect(result.current.severityFilter.low).toBe(true);
    act(() => result.current.toggleSeverity('high'));
    expect(result.current.severityFilter.high).toBe(false);
  });

  it('tracks the hovered clause id', () => {
    const { result } = renderHook(() => useHighlightSettings(), { wrapper });
    act(() => result.current.setHoveredClauseId('c1'));
    expect(result.current.hoveredClauseId).toBe('c1');
    act(() => result.current.setHoveredClauseId(null));
    expect(result.current.hoveredClauseId).toBeNull();
  });

  it('isSeverityVisible reflects master toggle AND the per-severity filter', () => {
    const { result } = renderHook(() => useHighlightSettings(), { wrapper });
    // default: high visible, low hidden
    expect(result.current.isSeverityVisible('high')).toBe(true);
    expect(result.current.isSeverityVisible('low')).toBe(false);
    // master off hides everything
    act(() => result.current.setShowHighlights(false));
    expect(result.current.isSeverityVisible('high')).toBe(false);
  });

  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useHighlightSettings())).toThrow(
      /PdfHighlightProvider/,
    );
  });
});
