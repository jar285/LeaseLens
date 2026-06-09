'use client';

/*
 * Sprint 28.15 — generic confirmation dialog.
 *
 * A domain-free presenter (Uncle Bob / DIP): it renders a yes/no question and
 * calls back. It must NOT know about leases, Blob URLs, or IndexedDB — the
 * caller owns the answer's consequences. Built on the native <dialog> +
 * showModal()/close() pattern proven by PdfFocusDialog (focus trap, Esc, and
 * the ::backdrop scrim come for free), with the two things a confirm needs
 * that PdfFocusDialog lacks: role="alertdialog" + aria-describedby (so a SR
 * user hears the consequence on open) and focus-return to the opener on close.
 */

import { TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  /** Accessible name (aria-labelledby). */
  title: string;
  /** Consequence copy (aria-describedby) — read to SR users on open. */
  description: string;
  /** Verb+object on the affirmative button, e.g. "Reset workspace". */
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive styling: danger fill + warning icon (colour never alone). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // The element focused when we opened — focus returns here on close. happy-dom
  // won't auto-return focus, and a destructive action must not strand the
  // keyboard user (mirrors AssistantFab.client.tsx:238-248).
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // Drive open-state imperatively. showModal() gives modal semantics + the
  // native Esc->`close` event that the `open` attribute alone cannot. On open
  // we focus Cancel (the SAFE action — a stray Enter must dismiss, not
  // destroy); on close we return focus to the opener.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.hasAttribute('open')) {
      openerRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.hasAttribute('open')) {
      dialog.close();
      openerRef.current?.focus();
    }
  }, [open]);

  // Bridge the native `close` event (Esc or dialog.close()) to onCancel so
  // Escape always equals Cancel — never a confirm.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handle = () => onCancel();
    dialog.addEventListener('close', handle);
    return () => dialog.removeEventListener('close', handle);
  }, [onCancel]);

  // A click whose target is the <dialog> itself landed on the backdrop region
  // around the panel — dismiss (safe). Clicks inside the panel do not bubble a
  // target of the dialog element, so they are ignored.
  function handleDialogClick(event: React.MouseEvent<HTMLDialogElement>): void {
    if (event.target === dialogRef.current) onCancel();
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the dialog's onClick is backdrop-dismiss only (a mouse enhancement); keyboard users dismiss via Escape, handled by the native `close` event bridge above.
    <dialog
      ref={dialogRef}
      data-testid="confirm-dialog"
      // Role/aria only while open: a closed native <dialog> should expose no
      // alertdialog to the a11y tree (and lets callers assert its absence).
      role={open ? 'alertdialog' : undefined}
      aria-modal={open ? 'true' : undefined}
      aria-labelledby={open ? titleId : undefined}
      aria-describedby={open ? descId : undefined}
      onClick={handleDialogClick}
      // Full-viewport dialog + centred panel so the area around the panel is
      // the backdrop click target. Scrim via the --color-backdrop token
      // (auto-flips at :root.dark), dialog box itself transparent.
      //
      // Sprint 28.15 — calm, symmetric fade + subtle scale, BOTH directions.
      // The fade/scale lives on the dialog element (not the inner panel)
      // because that's the element whose discrete display/overlay must persist
      // during the leave: `transition-discrete` (transition-behavior:
      // allow-discrete) defers the display:none / top-layer removal until the
      // opacity+scale transition finishes, so close() eases OUT instead of
      // popping. `starting:open:*` seeds the enter; `open:*` are the settled
      // values; both no-op under prefers-reduced-motion. The scrim fades with
      // it so the whole layer settles/leaves as one motion.
      className="fixed inset-0 m-0 h-screen max-h-screen w-screen max-w-none scale-95 bg-transparent p-0 opacity-0 transition transition-discrete duration-150 ease-out open:scale-100 open:opacity-100 backdrop:bg-backdrop backdrop:opacity-0 backdrop:transition-opacity backdrop:duration-150 backdrop:ease-out open:backdrop:opacity-100 starting:open:scale-95 starting:open:opacity-0 motion-reduce:transition-none starting:open:backdrop:opacity-0 motion-reduce:backdrop:transition-none"
    >
      {/* Sprint 28.15 — panel is ALWAYS mounted (not gated on `open`) so the
          leave animation has content to show: the dialog's allow-discrete
          display/overlay keeps it visible while it fades out. Visibility +
          a11y are gated by the dialog's [open]/role instead of unmounting. */}
      <div className="flex h-full w-full items-center justify-center p-4">
        <div
          data-testid="confirm-dialog-panel"
          // Sprint 28.15 — static surface. The fade + scale motion lives on
          // the parent <dialog> (see above) so the leave animation can defer
          // display:none via allow-discrete; the panel just rides it.
          className="w-full max-w-sm rounded-lg border border-neutral-200 bg-surface-elevated p-5 shadow-xl dark:border-neutral-800"
        >
          <h2
            id={titleId}
            className="text-[15px] font-semibold text-fg-default"
          >
            {title}
          </h2>
          <p
            id={descId}
            className="mt-2 text-[13px] leading-relaxed text-fg-muted"
          >
            {description}
          </p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-200 bg-surface-card px-3.5 text-[13px] font-medium text-fg-default transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 motion-reduce:transition-none dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={
                destructive
                  ? 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-danger-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-danger-600/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 motion-reduce:transition-none'
                  : 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md bg-accent-600 px-3.5 text-[13px] font-semibold text-white transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 motion-reduce:transition-none'
              }
            >
              {destructive ? (
                <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
              ) : null}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
