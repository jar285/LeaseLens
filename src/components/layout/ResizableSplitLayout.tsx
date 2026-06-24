// biome-ignore-all lint/a11y/useSemanticElements: WAI-ARIA's interactive
// separator pattern requires a focusable element with role="separator".
// Biome's suggested <hr> can't accept keyboard / pointer handlers and
// drops focusability; <div role="separator" tabIndex={0}> is the
// canonical implementation for resizable splitters.

'use client';

/*
 * S20.3 — three-pane layout with drag-resizable side panes.
 *
 * The grid template is
 *   `var(--pane-left) 4px minmax(0, 1fr) 4px var(--pane-right)`
 * so the two side panes' widths are driven by CSS custom properties.
 * Each 4px column hosts a <button role="separator"> that:
 *   - on pointerdown captures the pointer and updates the matching
 *     pane width as it moves
 *   - on ArrowLeft/Right adjusts in keyboard-friendly 16 px steps
 *   - on Home/End clamps to the min/max for that boundary
 *
 * Widths flow through usePersistedPaneWidths so a power user's layout
 * survives reload. The hook also applies the clamp limits, so this
 * component never produces a value outside (min, max).
 *
 * `enabled={false}` is an escape hatch for tests / SSR — the layout
 * renders with the default widths and no resize affordances.
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  PANE_LIMITS,
  usePersistedPaneWidths,
} from '@/lib/layout/use-persisted-pane-widths';

const KEYBOARD_STEP_PX = 16;

export interface ResizableSplitLayoutProps {
  left: React.ReactNode;
  centre: React.ReactNode;
  right: React.ReactNode;
  enabled?: boolean;
  /**
   * Override for the root data-testid so a consumer can keep a stable
   * `shell-root` selector without coupling this layout to one consumer.
   * (Originally added for the since-removed `LeaseLensWorkspaceShell`; kept
   * generic.)
   */
  rootTestId?: string;
  /** Forwarded data-attribute on the root for routing-mode probes. */
  dataShellRouteMode?: string;
}

export function ResizableSplitLayout({
  left,
  centre,
  right,
  enabled = true,
  rootTestId = 'resizable-split-root',
  dataShellRouteMode,
}: ResizableSplitLayoutProps): React.JSX.Element {
  const { leftWidth, rightWidth, setLeftWidth, setRightWidth } =
    usePersistedPaneWidths();

  const dragRef = useRef<{
    side: 'left' | 'right';
    startX: number;
    startWidth: number;
  } | null>(null);

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const delta = event.clientX - drag.startX;
      if (drag.side === 'left') {
        // Boundary moves with the pointer; pane width follows.
        setLeftWidth(drag.startWidth + delta);
      } else {
        // Right boundary: moving the pointer LEFT widens the pane.
        setRightWidth(drag.startWidth - delta);
      }
    },
    [setLeftWidth, setRightWidth],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [onPointerMove]);

  const startDrag = useCallback(
    (side: 'left' | 'right', event: React.PointerEvent<HTMLDivElement>) => {
      dragRef.current = {
        side,
        startX: event.clientX,
        startWidth: side === 'left' ? leftWidth : rightWidth,
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [leftWidth, rightWidth, onPointerMove, onPointerUp],
  );

  // Clean up listeners if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  function onKeyDown(
    side: 'left' | 'right',
    event: React.KeyboardEvent<HTMLDivElement>,
  ) {
    const current = side === 'left' ? leftWidth : rightWidth;
    const set = side === 'left' ? setLeftWidth : setRightWidth;
    const min = side === 'left' ? PANE_LIMITS.minLeft : PANE_LIMITS.minRight;
    const max = side === 'left' ? PANE_LIMITS.maxLeft : PANE_LIMITS.maxRight;

    // Visual model: pressing ArrowLeft on the LEFT separator shrinks
    // the LEFT pane. On the RIGHT separator it grows the RIGHT pane
    // (boundary moves toward the centre → right pane widens leftward).
    const direction = side === 'left' ? 1 : -1;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      set(current - KEYBOARD_STEP_PX * direction);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      set(current + KEYBOARD_STEP_PX * direction);
    } else if (event.key === 'Home') {
      event.preventDefault();
      set(min);
    } else if (event.key === 'End') {
      event.preventDefault();
      set(max);
    }
  }

  const SEPARATOR_BASE =
    'group hidden lg:flex relative h-full min-w-2 w-2 cursor-col-resize items-center justify-center bg-transparent transition-colors hover:bg-accent-100/40 focus-visible:outline-none focus-visible:bg-accent-100/60 dark:hover:bg-accent-500/15 dark:focus-visible:bg-accent-500/25';

  if (!enabled) {
    return (
      <div
        data-testid={rootTestId}
        data-shell-route-mode={dataShellRouteMode}
        className="grid h-full min-h-0 w-full grid-cols-1 lg:grid-cols-[var(--pane-left)_minmax(0,1fr)_var(--pane-right)]"
        style={
          {
            '--pane-left': `${leftWidth}px`,
            '--pane-right': `${rightWidth}px`,
          } as React.CSSProperties
        }
      >
        {/* S20.6 — flex h-full establishes a definite height for the
            slot, so a child's `flex h-full min-h-0 overflow-y-auto`
            chain actually scrolls. `block` collapsed the height
            chain and made PDF pages unscrollable in inline mode. */}
        <div className="hidden h-full min-h-0 min-w-0 lg:flex lg:flex-col">
          {left}
        </div>
        <div className="flex h-full min-h-0 min-w-0 flex-col">{centre}</div>
        <div className="hidden h-full min-h-0 min-w-0 lg:flex lg:flex-col">
          {right}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={rootTestId}
      data-shell-route-mode={dataShellRouteMode}
      className="grid h-full min-h-0 w-full grid-cols-1 overflow-hidden lg:grid-cols-[var(--pane-left)_auto_minmax(0,1fr)_auto_var(--pane-right)]"
      style={
        {
          '--pane-left': `${leftWidth}px`,
          '--pane-right': `${rightWidth}px`,
        } as React.CSSProperties
      }
    >
      {/* S20.6 — flex h-full establishes a definite height for the
          slot, so descendant scroll chains (e.g. PdfViewer's
          `flex h-full min-h-0 overflow-y-auto`) actually scroll. */}
      <div className="hidden h-full min-h-0 min-w-0 lg:flex lg:flex-col">
        {left}
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize left pane"
        aria-valuenow={leftWidth}
        aria-valuemin={PANE_LIMITS.minLeft}
        aria-valuemax={PANE_LIMITS.maxLeft}
        data-handle="left"
        onPointerDown={(e) => startDrag('left', e)}
        onKeyDown={(e) => onKeyDown('left', e)}
        className={SEPARATOR_BASE}
      >
        <span
          aria-hidden="true"
          className="block h-8 w-px bg-neutral-200 transition-colors group-hover:bg-accent-300 group-focus-visible:bg-accent-400 dark:bg-neutral-700 dark:group-hover:bg-accent-400/60"
        />
      </div>
      <div className="flex h-full min-h-0 min-w-0 flex-col">{centre}</div>
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize right pane"
        aria-valuenow={rightWidth}
        aria-valuemin={PANE_LIMITS.minRight}
        aria-valuemax={PANE_LIMITS.maxRight}
        data-handle="right"
        onPointerDown={(e) => startDrag('right', e)}
        onKeyDown={(e) => onKeyDown('right', e)}
        className={SEPARATOR_BASE}
      >
        <span
          aria-hidden="true"
          className="block h-8 w-px bg-neutral-200 transition-colors group-hover:bg-accent-300 group-focus-visible:bg-accent-400 dark:bg-neutral-700 dark:group-hover:bg-accent-400/60"
        />
      </div>
      <div className="hidden h-full min-h-0 min-w-0 lg:flex lg:flex-col">
        {right}
      </div>
    </div>
  );
}
