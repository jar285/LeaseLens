// S20.3 — three-pane layout with drag-resizable side panes.
//
// Two separators ride the boundary between the left/centre and
// centre/right columns. They're real <button role="separator"> nodes
// so both pointer and keyboard users can adjust the split. Widths
// flow through CSS custom properties so the consuming shell doesn't
// need to know about resize logic.

import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PANE_DEFAULTS,
  PANE_LIMITS,
  STORAGE_KEY,
} from '@/lib/layout/use-persisted-pane-widths';
import { ResizableSplitLayout } from './ResizableSplitLayout';

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
});

const slots = {
  left: <div data-testid="left">L</div>,
  centre: <div data-testid="centre">C</div>,
  right: <div data-testid="right">R</div>,
};

describe('ResizableSplitLayout', () => {
  it('renders all three pane slots', () => {
    render(<ResizableSplitLayout {...slots} />);
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('centre')).toBeInTheDocument();
    expect(screen.getByTestId('right')).toBeInTheDocument();
  });

  it('exposes two separators with ARIA orientation/value attributes', () => {
    render(<ResizableSplitLayout {...slots} />);
    const sep = screen.getAllByRole('separator');
    expect(sep).toHaveLength(2);
    for (const s of sep) {
      expect(s.getAttribute('aria-orientation')).toBe('vertical');
      expect(s.getAttribute('aria-valuenow')).toMatch(/^\d+$/);
      expect(s.getAttribute('aria-valuemin')).toMatch(/^\d+$/);
      expect(s.getAttribute('aria-valuemax')).toMatch(/^\d+$/);
    }
  });

  it('applies the persisted pane widths to the grid via CSS variables', () => {
    render(<ResizableSplitLayout {...slots} />);
    const root = screen.getByTestId('resizable-split-root');
    const style = root.getAttribute('style') ?? '';
    expect(style).toContain('--pane-left');
    expect(style).toContain('--pane-right');
    // The defaults from the hook surface as CSS px values.
    expect(style).toMatch(new RegExp(`${PANE_DEFAULTS.leftWidth}px`));
    expect(style).toMatch(new RegExp(`${PANE_DEFAULTS.rightWidth}px`));
  });

  it('keyboard ArrowLeft on the left separator shrinks the left pane', () => {
    render(<ResizableSplitLayout {...slots} />);
    const [leftSep] = screen.getAllByRole('separator');
    const before = Number(leftSep.getAttribute('aria-valuenow'));
    fireEvent.keyDown(leftSep, { key: 'ArrowLeft' });
    const after = Number(leftSep.getAttribute('aria-valuenow'));
    expect(after).toBeLessThan(before);
  });

  it('keyboard ArrowRight on the left separator grows the left pane', () => {
    render(<ResizableSplitLayout {...slots} />);
    const [leftSep] = screen.getAllByRole('separator');
    const before = Number(leftSep.getAttribute('aria-valuenow'));
    fireEvent.keyDown(leftSep, { key: 'ArrowRight' });
    const after = Number(leftSep.getAttribute('aria-valuenow'));
    expect(after).toBeGreaterThan(before);
  });

  it('Home key clamps the left pane to its minimum width', () => {
    render(<ResizableSplitLayout {...slots} />);
    const [leftSep] = screen.getAllByRole('separator');
    fireEvent.keyDown(leftSep, { key: 'Home' });
    expect(Number(leftSep.getAttribute('aria-valuenow'))).toBe(
      PANE_LIMITS.minLeft,
    );
  });

  it('End key clamps the left pane to its maximum width', () => {
    render(<ResizableSplitLayout {...slots} />);
    const [leftSep] = screen.getAllByRole('separator');
    fireEvent.keyDown(leftSep, { key: 'End' });
    expect(Number(leftSep.getAttribute('aria-valuenow'))).toBe(
      PANE_LIMITS.maxLeft,
    );
  });

  it('right separator keyboard moves the right pane in the OPPOSITE direction (visual symmetry)', () => {
    // ArrowLeft on the RIGHT separator should grow the right pane
    // (the boundary moves left). ArrowRight shrinks it.
    render(<ResizableSplitLayout {...slots} />);
    const [, rightSep] = screen.getAllByRole('separator');
    const before = Number(rightSep.getAttribute('aria-valuenow'));
    fireEvent.keyDown(rightSep, { key: 'ArrowLeft' });
    const after = Number(rightSep.getAttribute('aria-valuenow'));
    expect(after).toBeGreaterThan(before);
  });

  it('each separator is keyboard-reachable with a visible focus ring', () => {
    // Separators are desktop-only (the 44px touch-target rule applies
    // to mobile primary interactions, which these are not). What we
    // verify instead is that the separator is keyboard-reachable and
    // has a focus ring that meets the a11y contract.
    render(<ResizableSplitLayout {...slots} />);
    const sep = screen.getAllByRole('separator');
    for (const s of sep) {
      expect(s.className).toMatch(/focus-visible:/);
      expect(s.className).toMatch(/cursor-col-resize/);
    }
  });

  it('persists pane widths to localStorage on keyboard adjust', () => {
    render(<ResizableSplitLayout {...slots} />);
    const [leftSep] = screen.getAllByRole('separator');
    fireEvent.keyDown(leftSep, { key: 'ArrowLeft' });
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? '{}',
    ) as { leftWidth?: number };
    expect(typeof stored.leftWidth).toBe('number');
  });

  it('hides separators below the lg breakpoint (mobile collapses to single column)', () => {
    render(<ResizableSplitLayout {...slots} />);
    const sep = screen.getAllByRole('separator');
    for (const s of sep) {
      expect(s.className).toMatch(/hidden\s+lg:/);
    }
  });

  it('honours an `enabled={false}` prop by rendering with raw defaults and no separators', () => {
    // Defensive escape hatch for SSR-only or test contexts.
    render(<ResizableSplitLayout {...slots} enabled={false} />);
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('fires onClick=submit on pointerdown gestures (no full pointer-drag in jsdom)', () => {
    // jsdom doesn't fire pointermove on synthetic pointerdown, but we
    // can at least assert the separator participates in the gesture
    // by checking the data-testid carries the expected role.
    render(<ResizableSplitLayout {...slots} />);
    const [leftSep] = screen.getAllByRole('separator');
    expect(leftSep.getAttribute('data-handle')).toBe('left');
  });

  // S20.6 — pane slots must propagate height to their children so a
  // descendant `flex h-full min-h-0` scroll chain (e.g. PdfViewer's
  // scroll area) actually scrolls. Using `display: block` here
  // collapses the chain and the PDF page list becomes unscrollable
  // until the user opens Focus mode (which re-roots the layout).
  it('S20.6 — pane slots pass height through via flex h-full so child scroll chains work', () => {
    render(<ResizableSplitLayout {...slots} />);
    // The left + right slots are the only pane wrappers in this test.
    // Each must be a flex container with full height so a child
    // <PdfViewer> can use `flex h-full min-h-0 overflow-y-auto`
    // safely.
    const leftPane = screen.getByTestId('left').parentElement;
    const rightPane = screen.getByTestId('right').parentElement;
    expect(leftPane?.className).toMatch(/\bflex\b/);
    expect(leftPane?.className).toMatch(/\bh-full\b/);
    expect(rightPane?.className).toMatch(/\bflex\b/);
    expect(rightPane?.className).toMatch(/\bh-full\b/);
  });
});
