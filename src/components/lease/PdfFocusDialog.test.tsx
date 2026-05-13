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

  // S23a.1 — backdrop styling consumes the design token, not inline values.
  // The token `--color-backdrop` (defined in globals.css `@theme` + `:root.dark`)
  // auto-flips between schemes; the component just references `bg-backdrop` via
  // the `::backdrop` pseudo-element variant.
  it('backdrop pseudo-element uses the bg-backdrop design token', () => {
    render(
      <PdfFocusDialog open={true} onClose={vi.fn()}>
        <p>body</p>
      </PdfFocusDialog>,
    );
    const dialog = screen.getByTestId('pdf-focus-dialog');
    expect(dialog.className).toMatch(/\bbackdrop:bg-backdrop\b/);
    // The inline neutral-950/40 + black/60 backdrop values must be gone.
    expect(dialog.className).not.toMatch(/backdrop:bg-neutral-950\/40/);
    expect(dialog.className).not.toMatch(/backdrop:bg-black\/60/);
  });

  // Sprint 23b Phase 4 — header polish. Header strip uses surface-elevated
  // (auto-flips at :root.dark, no per-class dark variants). Close button is
  // icon-only (no visible label), but keeps the accessible aria-label and
  // the 44×44 touch-target floor.
  it('header strip uses the bg-surface-elevated design token', () => {
    render(
      <PdfFocusDialog open={true} onClose={vi.fn()} title="lease.pdf">
        <p>body</p>
      </PdfFocusDialog>,
    );
    // The dialog wraps a flex container; its first child <header> carries
    // the title + close button. Find it by role.
    const heading = screen.getByRole('heading', { name: /lease\.pdf/i });
    const header = heading.closest('header');
    expect(header).not.toBeNull();
    expect(header?.className).toMatch(/\bbg-surface-elevated\b/);
    // The old bordered + per-class dark surface styles must be gone.
    expect(header?.className).not.toMatch(
      /bg-surface-card.*dark:bg-neutral-900/,
    );
  });

  it('close button is icon-only (no visible "Close focus" word in the DOM)', () => {
    render(
      <PdfFocusDialog open={true} onClose={vi.fn()}>
        <p>body</p>
      </PdfFocusDialog>,
    );
    const close = screen.getByLabelText(/close.*focus/i);
    // Visible text content of the button should be empty/whitespace.
    // (The X icon has aria-hidden so it doesn't appear in the accessible
    // name; the button's name comes from aria-label.)
    expect((close.textContent ?? '').trim()).toBe('');
  });
});
