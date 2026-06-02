// Sprint 28.15 — red tests for the generic ConfirmDialog primitive.
//
// ConfirmDialog is a domain-free presenter (Uncle Bob: DIP). It renders a
// yes/no alertdialog and calls back; it knows nothing of leases, Blob URLs,
// or IndexedDB. These tests pin the user-visible behaviour (Kent C. Dodds)
// and the WCAG acceptance checklist — never the destructive side effects,
// which live in the caller and are covered by ParserResultsShell.test.tsx.

import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

// happy-dom doesn't implement HTMLDialogElement.showModal/close — mirror the
// PdfFocusDialog.test.tsx polyfill so the native <dialog> can open/close.
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

const baseProps = {
  open: true,
  title: 'Reset workspace?',
  description: 'This removes the uploaded lease. This cannot be undone.',
  confirmLabel: 'Reset workspace',
  destructive: true,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ConfirmDialog (Sprint 28.15)', () => {
  it('is closed (no open attribute) when open=false', () => {
    render(<ConfirmDialog {...baseProps} open={false} />);
    expect(screen.getByTestId('confirm-dialog')).not.toHaveAttribute('open');
  });

  it('renders an alertdialog with the title + description wired via aria when open', () => {
    render(<ConfirmDialog {...baseProps} />);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelId = dialog.getAttribute('aria-labelledby');
    const descId = dialog.getAttribute('aria-describedby');
    expect(document.getElementById(labelId as string)?.textContent).toBe(
      'Reset workspace?',
    );
    expect(document.getElementById(descId as string)?.textContent).toContain(
      'cannot be undone',
    );
  });

  it('Cancel fires onCancel and never onConfirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('Confirm fires onConfirm and never onCancel', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: /reset workspace/i }),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('Escape (native close event) fires onCancel — never confirms', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent(screen.getByTestId('confirm-dialog'), new Event('close'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('backdrop click (target is the dialog itself) fires onCancel', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);
    const dialog = screen.getByTestId('confirm-dialog');
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('clicking inside the panel does NOT dismiss', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);
    // The title heading lives inside the panel; clicking it must not cancel.
    fireEvent.click(screen.getByText('Reset workspace?'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('focuses the safe (Cancel) action on open, not the destructive confirm', () => {
    render(<ConfirmDialog {...baseProps} />);
    const cancel = screen.getByRole('button', { name: /cancel/i });
    expect(document.activeElement).toBe(cancel);
  });

  it('destructive confirm button uses the danger token + verb label + 44px target + focus ring', () => {
    render(<ConfirmDialog {...baseProps} />);
    const confirm = screen.getByRole('button', { name: /reset workspace/i });
    expect(confirm.className).toMatch(/\bbg-danger-600\b/);
    expect(confirm.className).toMatch(/\bmin-h-11\b/);
    expect(confirm.className).toMatch(/focus-visible:ring-accent-300/);
  });

  it('renders an aria-hidden warning icon on the destructive confirm (colour never alone)', () => {
    render(<ConfirmDialog {...baseProps} />);
    const confirm = screen.getByRole('button', { name: /reset workspace/i });
    const icon = confirm.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('respects reduced motion (transition disabled under prefers-reduced-motion)', () => {
    render(<ConfirmDialog {...baseProps} />);
    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog.className).toMatch(/motion-reduce:transition-none/);
  });

  it('eases both in and out with a fade + subtle scale (symmetric, allow-discrete)', () => {
    // Sprint 28.15 — a native <dialog> jumps from display:none on open and to
    // display:none on close(), so neither direction animates with a plain
    // transition. The fix is the canonical platform pattern on the dialog
    // element: `transition-discrete` (transition-behavior: allow-discrete)
    // defers the discrete display/overlay flip until the opacity+scale
    // transition finishes — so it eases OUT on dismiss too. `starting:open:*`
    // gives the enter its initial. Under prefers-reduced-motion both are off.
    render(<ConfirmDialog {...baseProps} />);
    const dialog = screen.getByTestId('confirm-dialog');
    expect(dialog.className).toMatch(/\btransition\b/);
    // allow-discrete → the exit (leave) animation, the new half:
    expect(dialog.className).toMatch(/transition-discrete/);
    // open-state end values + the @starting-style initial for the enter:
    expect(dialog.className).toMatch(/open:opacity-100/);
    expect(dialog.className).toMatch(/open:scale-100/);
    expect(dialog.className).toMatch(/starting:open:opacity-0/);
    expect(dialog.className).toMatch(/starting:open:scale-95/);
  });
});
