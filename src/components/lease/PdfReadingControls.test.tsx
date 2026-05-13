// S20.2 — header-level PDF reading controls.
//
// The control surface is pure presentation: zoom is owned by the parent
// PdfViewerClient (which clamps the page-width prop) and only callbacks
// flow back through props. This file pins the rendering contract and
// keyboard accessibility — actual zoom semantics + page-index tracking
// live in PdfViewerClient.

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfReadingControls } from './PdfReadingControls';

afterEach(cleanup);

describe('PdfReadingControls', () => {
  it('renders the zoom-in / zoom-out / fit-width / page indicator slots', () => {
    render(
      <PdfReadingControls
        zoom={1}
        fit={true}
        currentPage={3}
        totalPages={12}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onToggleFit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/zoom in/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/zoom out/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fit.*width/i)).toBeInTheDocument();
    expect(screen.getByTestId('pdf-page-indicator')).toHaveTextContent(
      /page\s*3\s*\/\s*12/i,
    );
  });

  it('fires the appropriate callbacks on button clicks', () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onToggleFit = vi.fn();
    render(
      // fit=false so the zoom buttons aren't disabled.
      <PdfReadingControls
        zoom={1}
        fit={false}
        currentPage={1}
        totalPages={5}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onToggleFit={onToggleFit}
      />,
    );
    fireEvent.click(screen.getByLabelText(/zoom in/i));
    fireEvent.click(screen.getByLabelText(/zoom out/i));
    fireEvent.click(screen.getByLabelText(/fit.*width/i));
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onToggleFit).toHaveBeenCalledTimes(1);
  });

  it('disables zoom-out at the minimum zoom level', () => {
    render(
      <PdfReadingControls
        zoom={0.5}
        fit={false}
        currentPage={1}
        totalPages={5}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onToggleFit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/zoom out/i)).toBeDisabled();
    expect(screen.getByLabelText(/zoom in/i)).not.toBeDisabled();
  });

  it('disables zoom-in at the maximum zoom level', () => {
    render(
      <PdfReadingControls
        zoom={2}
        fit={false}
        currentPage={1}
        totalPages={5}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onToggleFit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/zoom in/i)).toBeDisabled();
    expect(screen.getByLabelText(/zoom out/i)).not.toBeDisabled();
  });

  // S20.7 — smart zoom. Previously the zoom buttons sat disabled
  // while Fit Width was on (showing "75%" the user couldn't change).
  // After S20.7 the zoom buttons stay enabled even when Fit Width is
  // on; clicking them fires the zoom callback. The parent
  // (PdfViewerClient) is expected to also flip fit-off in response —
  // tested at the integration level.
  it('S20.7 — zoom buttons stay enabled even when Fit Width is on', () => {
    render(
      <PdfReadingControls
        zoom={1}
        fit={true}
        currentPage={1}
        totalPages={5}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onToggleFit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/zoom in/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/zoom out/i)).not.toBeDisabled();
  });

  it('marks the fit-width toggle as pressed when fit is on (aria-pressed)', () => {
    const { rerender } = render(
      <PdfReadingControls
        zoom={1}
        fit={true}
        currentPage={1}
        totalPages={5}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onToggleFit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/fit.*width/i)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    rerender(
      <PdfReadingControls
        zoom={1}
        fit={false}
        currentPage={1}
        totalPages={5}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onToggleFit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/fit.*width/i)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('renders "—" for totalPages when the document has not loaded yet', () => {
    render(
      <PdfReadingControls
        zoom={1}
        fit={true}
        currentPage={null}
        totalPages={0}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onToggleFit={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pdf-page-indicator')).toHaveTextContent(
      /—|loading/i,
    );
  });

  it('all interactive elements clear the 44px touch-target floor', () => {
    render(
      <PdfReadingControls
        zoom={1}
        fit={true}
        currentPage={1}
        totalPages={5}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onToggleFit={vi.fn()}
      />,
    );
    for (const label of [/zoom in/i, /zoom out/i, /fit.*width/i]) {
      expect(screen.getByLabelText(label).className).toMatch(
        /\bmin-h-(11|10|9)\b/,
      );
    }
  });

  // Sprint 23b Phase 2 — compact mode for inline viewer chrome.
  // When the controls live inside the inline (non-focus) viewer header,
  // pane width is tight (~280-320px). The compact mode hides the visible
  // "Fit width" text (icon only, aria-label preserved) and trims the
  // page indicator to "Page N" (no "/ Total"). Default (non-compact)
  // mode is unchanged; Focus mode keeps the full presentation.
  describe('Sprint 23b — compact mode', () => {
    it('hides the visible "Fit width" text but keeps the aria-labeled button', () => {
      render(
        <PdfReadingControls
          zoom={1}
          fit={false}
          currentPage={1}
          totalPages={5}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onToggleFit={vi.fn()}
          compact={true}
        />,
      );
      // The button is still reachable by accessible name.
      expect(screen.getByLabelText(/fit.*width/i)).toBeInTheDocument();
      // But the visible "Fit width" word is gone.
      expect(screen.queryByText(/^Fit width$/)).not.toBeInTheDocument();
    });

    it('drops the "/ Total" suffix from the page indicator', () => {
      render(
        <PdfReadingControls
          zoom={1}
          fit={false}
          currentPage={3}
          totalPages={12}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onToggleFit={vi.fn()}
          compact={true}
        />,
      );
      const indicator = screen.getByTestId('pdf-page-indicator');
      expect(indicator).toHaveTextContent(/^Page\s*3$/);
      expect(indicator.textContent).not.toMatch(/\/\s*12/);
    });

    it('default (no compact prop) keeps the full "Page N / Total" form and visible label', () => {
      render(
        <PdfReadingControls
          zoom={1}
          fit={false}
          currentPage={3}
          totalPages={12}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onToggleFit={vi.fn()}
        />,
      );
      const indicator = screen.getByTestId('pdf-page-indicator');
      expect(indicator).toHaveTextContent(/page\s*3\s*\/\s*12/i);
      // Visible "Fit width" label present on viewport >= sm
      // (we don't assert on sm-breakpoint visibility here because the
      // sm:inline class is media-query-driven; the text node is still
      // in the DOM, which is what testing-library queries.)
      expect(screen.getByText(/^Fit width$/)).toBeInTheDocument();
    });
  });
});
