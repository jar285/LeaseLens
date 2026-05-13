// S20.2 — full-viewport Focus mode for the PDF viewer.
//
// PdfFocusDialog is a thin wrapper around the native <dialog> element
// so we get keyboard focus trapping + Esc-to-close + modal background
// scrim "for free" without a portal library. Body content is provided
// by the caller as `children`; PdfViewerClient passes its inner
// viewer body in both inline and focused contexts so the same scroll
// area + Document instance render in both surfaces.

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PdfFocusDialog } from './PdfFocusDialog';

// jsdom doesn't implement HTMLDialogElement.showModal/close. Stub them
// with simple `open` attribute toggles so we can assert open-state
// without breaking the test environment.
beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '');
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
});

afterEach(cleanup);

describe('PdfFocusDialog', () => {
  it('renders a <dialog> with the focus-dialog testid', () => {
    render(
      <PdfFocusDialog open={false} onClose={vi.fn()}>
        <p>body</p>
      </PdfFocusDialog>,
    );
    expect(screen.getByTestId('pdf-focus-dialog').tagName).toBe('DIALOG');
  });

  it('does NOT have the open attribute when open=false', () => {
    render(
      <PdfFocusDialog open={false} onClose={vi.fn()}>
        <p>body</p>
      </PdfFocusDialog>,
    );
    expect(screen.getByTestId('pdf-focus-dialog')).not.toHaveAttribute('open');
  });

  it('applies the open attribute when open=true (showModal called)', () => {
    render(
      <PdfFocusDialog open={true} onClose={vi.fn()}>
        <p>body</p>
      </PdfFocusDialog>,
    );
    expect(screen.getByTestId('pdf-focus-dialog')).toHaveAttribute('open');
  });

  it('renders a Close button with an accessible label that fires onClose', () => {
    const onClose = vi.fn();
    render(
      <PdfFocusDialog open={true} onClose={onClose}>
        <p>body</p>
      </PdfFocusDialog>,
    );
    const close = screen.getByLabelText(/close.*focus/i);
    expect(close).toBeInTheDocument();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('children render inside the dialog (the body is forwarded)', () => {
    render(
      <PdfFocusDialog open={true} onClose={vi.fn()}>
        <span data-testid="focus-body">my-body</span>
      </PdfFocusDialog>,
    );
    expect(screen.getByTestId('focus-body')).toBeInTheDocument();
  });

  it('aria-labelledby points at a heading describing the focused PDF', () => {
    render(
      <PdfFocusDialog open={true} onClose={vi.fn()} title="my-lease.pdf">
        <p>body</p>
      </PdfFocusDialog>,
    );
    const dialog = screen.getByTestId('pdf-focus-dialog');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId as string)?.textContent).toBe(
      'my-lease.pdf',
    );
  });

  it('Close button is at least 44px tall (touch-target floor)', () => {
    render(
      <PdfFocusDialog open={true} onClose={vi.fn()}>
        <p>body</p>
      </PdfFocusDialog>,
    );
    const close = screen.getByLabelText(/close.*focus/i);
    expect(close.className).toMatch(/\bmin-h-11\b/);
  });

  it('fires onClose when the native close event fires (Esc behaviour)', () => {
    const onClose = vi.fn();
    render(
      <PdfFocusDialog open={true} onClose={onClose}>
        <p>body</p>
      </PdfFocusDialog>,
    );
    const dialog = screen.getByTestId('pdf-focus-dialog');
    fireEvent(dialog, new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
