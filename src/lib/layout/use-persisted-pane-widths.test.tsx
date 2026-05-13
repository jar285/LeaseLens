// S20.3 — localStorage-backed pane widths.
//
// The hook owns two numbers (left + right pane width in CSS pixels)
// and synchronises them with localStorage so a power user's layout
// persists across page loads. Pure behaviour — no DOM access — so the
// tests target the hook through a tiny harness component.

import '@testing-library/jest-dom/vitest';

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PANE_DEFAULTS,
  PANE_LIMITS,
  type PaneWidths,
  STORAGE_KEY,
  usePersistedPaneWidths,
} from './use-persisted-pane-widths';

afterEach(cleanup);

beforeEach(() => {
  window.localStorage.clear();
});

function makeHarness() {
  const result: { current: ReturnType<typeof usePersistedPaneWidths> | null } =
    { current: null };
  function Probe() {
    result.current = usePersistedPaneWidths();
    return null;
  }
  return { result, Probe };
}

describe('usePersistedPaneWidths', () => {
  it('starts with defaults when localStorage has nothing for the key', () => {
    const { result, Probe } = makeHarness();
    render(<Probe />);
    expect(result.current?.leftWidth).toBe(PANE_DEFAULTS.leftWidth);
    expect(result.current?.rightWidth).toBe(PANE_DEFAULTS.rightWidth);
  });

  it('rehydrates from localStorage on mount when valid JSON is present', () => {
    const stored: PaneWidths = { leftWidth: 480, rightWidth: 380 };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const { result, Probe } = makeHarness();
    render(<Probe />);
    expect(result.current?.leftWidth).toBe(480);
    expect(result.current?.rightWidth).toBe(380);
  });

  it('ignores corrupt JSON in localStorage and falls back to defaults', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json');
    const { result, Probe } = makeHarness();
    render(<Probe />);
    expect(result.current?.leftWidth).toBe(PANE_DEFAULTS.leftWidth);
    expect(result.current?.rightWidth).toBe(PANE_DEFAULTS.rightWidth);
  });

  it('writes back to localStorage when setLeftWidth changes the value', () => {
    const { result, Probe } = makeHarness();
    render(<Probe />);
    act(() => {
      result.current?.setLeftWidth(500);
    });
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? '{}',
    ) as PaneWidths;
    expect(stored.leftWidth).toBe(500);
  });

  it('clamps left width to PANE_LIMITS.minLeft on the low end', () => {
    const { result, Probe } = makeHarness();
    render(<Probe />);
    act(() => {
      result.current?.setLeftWidth(50); // way below min
    });
    expect(result.current?.leftWidth).toBe(PANE_LIMITS.minLeft);
  });

  it('clamps left width to PANE_LIMITS.maxLeft on the high end', () => {
    const { result, Probe } = makeHarness();
    render(<Probe />);
    act(() => {
      result.current?.setLeftWidth(5000); // way above max
    });
    expect(result.current?.leftWidth).toBe(PANE_LIMITS.maxLeft);
  });

  it('the same clamps apply to right width', () => {
    const { result, Probe } = makeHarness();
    render(<Probe />);
    act(() => {
      result.current?.setRightWidth(50);
    });
    expect(result.current?.rightWidth).toBe(PANE_LIMITS.minRight);
    act(() => {
      result.current?.setRightWidth(5000);
    });
    expect(result.current?.rightWidth).toBe(PANE_LIMITS.maxRight);
  });

  it('rehydrated values that fall outside the clamps are coerced back into range', () => {
    const stored: PaneWidths = { leftWidth: 50, rightWidth: 9999 };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const { result, Probe } = makeHarness();
    render(<Probe />);
    expect(result.current?.leftWidth).toBe(PANE_LIMITS.minLeft);
    expect(result.current?.rightWidth).toBe(PANE_LIMITS.maxRight);
  });
});
