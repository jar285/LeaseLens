'use client';

/*
 * S20.2 — Focus mode for the PDF viewer.
 *
 * Thin wrapper around the native <dialog> element. We use the platform
 * dialog instead of a portal lib because it gives us, for free:
 *   - keyboard focus trap (Tab cycles inside the dialog)
 *   - Esc-to-close (fires a native `close` event we listen on)
 *   - backdrop scrim via the ::backdrop pseudo-element
 *   - modal semantics announced to screen readers
 *
 * The dialog body is provided by the caller as `children`; the
 * standard use is PdfViewerClient passing its scroll area + Pages so
 * the same Document mount renders in both inline and focused contexts.
 */

import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

export interface PdfFocusDialogProps {
  open: boolean;
  onClose: () => void;
  /** Visible heading at the top of the focused dialog. */
  title?: string;
  children: React.ReactNode;
}

export function PdfFocusDialog({
  open,
  onClose,
  title,
  children,
}: PdfFocusDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  // Drive the dialog's open-state imperatively. Calling showModal()
  // gives us modal semantics + Esc support that the `open` attribute
  // alone cannot. The cleanup ensures a re-render that flips to
  // `open=false` actually closes the dialog rather than just hiding it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.hasAttribute('open')) {
      dialog.showModal();
    } else if (!open && dialog.hasAttribute('open')) {
      dialog.close();
    }
  }, [open]);

  // Bridge the native `close` event (fired by Esc or dialog.close())
  // back to the React-side onClose so state stays in sync.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handle = () => onClose();
    dialog.addEventListener('close', handle);
    return () => dialog.removeEventListener('close', handle);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      data-testid="pdf-focus-dialog"
      aria-labelledby={title ? headingId : undefined}
      // S20.7 — explicit viewport sizing. `h-full` on a <dialog>
      // resolves against the dialog's UA intrinsic size (not the
      // viewport) on some browsers, which collapsed the height chain
      // and broke wheel-scroll inside Focus mode. `h-screen`/`w-screen`
      // pin the dialog to the actual viewport dimensions so the
      // descendant `flex h-full min-h-0 overflow-y-auto` chain inside
      // the recursive PdfViewer has a definite height to subtract from.
      // S23a.1 — backdrop consumed via the `--color-backdrop` token; it
      // auto-flips at `:root.dark`, so no per-class `dark:backdrop:*`.
      className="fixed inset-0 m-0 h-screen max-h-screen w-screen max-w-none bg-surface-base p-0 backdrop:bg-backdrop dark:bg-neutral-950"
    >
      <div className="flex h-screen min-h-0 flex-col">
        {/* Sprint 23b Phase 4 — header uses surface-elevated (auto-flips
            at :root.dark); close button is a borderless icon-only ghost
            button with a visible hover state. Touch target preserved at
            44×44 via min-h-11 / min-w-11. */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-100 bg-surface-elevated px-4 py-2 dark:border-neutral-800">
          <h2
            id={headingId}
            className="truncate text-[13px] font-medium text-fg-default"
          >
            {title ?? 'PDF — focused view'}
          </h2>
          <button
            type="button"
            aria-label="Close focus mode"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-1 dark:hover:bg-neutral-800 dark:hover:text-fg-default"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        {/* S20.7 — drop overflow-hidden so wheel events pass naturally
            to the descendant scroll area (the recursive PdfViewer's
            own overflow-y-auto). */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Only render the body when the dialog is open. The dialog
              element itself stays mounted so the imperative
              showModal()/close() effects + the `close` event listener
              keep working, but we avoid double-mounting the heavy
              <Document> when the dialog is currently hidden. */}
          {open ? children : null}
        </div>
      </div>
    </dialog>
  );
}
