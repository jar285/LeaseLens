'use client';

/*
 * S20.3 — localStorage-backed pane widths.
 *
 * Owns the two numbers that drive the resizable shell (left + right
 * pane width in CSS pixels). Persists every update to localStorage so
 * a power user's layout survives a page reload. SSR-safe: the first
 * paint always renders defaults; a client-only effect rehydrates from
 * localStorage on mount.
 *
 * Pure behaviour. No DOM access (the consuming component handles the
 * grid template + drag gesture).
 */

import { useCallback, useEffect, useState } from 'react';

export const STORAGE_KEY = 'leaselens.layout.paneWidths';

export interface PaneWidths {
  leftWidth: number;
  rightWidth: number;
}

// CSS-pixel defaults — mirror the S20.1 grid-template-columns
// var defaults (`26rem` / `22rem` at the 16px root font size).
export const PANE_DEFAULTS: PaneWidths = {
  leftWidth: 416, // 26rem
  rightWidth: 352, // 22rem
};

// Clamp bounds. Centre column needs at least ~24rem to stay readable;
// each side pane needs at least ~18rem so the headers don't collapse.
// The maxes keep one pane from devouring the viewport on a small screen.
export const PANE_LIMITS = {
  minLeft: 18 * 16, // 288 px
  maxLeft: 38 * 16, // 608 px
  minRight: 18 * 16, // 288 px
  maxRight: 32 * 16, // 512 px
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampPaneWidths(input: PaneWidths): PaneWidths {
  return {
    leftWidth: clamp(input.leftWidth, PANE_LIMITS.minLeft, PANE_LIMITS.maxLeft),
    rightWidth: clamp(
      input.rightWidth,
      PANE_LIMITS.minRight,
      PANE_LIMITS.maxRight,
    ),
  };
}

function readFromStorage(): PaneWidths | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PaneWidths>;
    if (
      typeof parsed?.leftWidth === 'number' &&
      typeof parsed?.rightWidth === 'number'
    ) {
      return { leftWidth: parsed.leftWidth, rightWidth: parsed.rightWidth };
    }
    return null;
  } catch {
    return null;
  }
}

function writeToStorage(widths: PaneWidths): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // localStorage write can throw under storage quotas / private mode.
    // Silently ignore — pane sizing is a UX nicety, not load-bearing.
  }
}

export interface UsePersistedPaneWidthsResult extends PaneWidths {
  setLeftWidth: (width: number) => void;
  setRightWidth: (width: number) => void;
}

export function usePersistedPaneWidths(): UsePersistedPaneWidthsResult {
  // Start with defaults so SSR + first client paint match. The effect
  // below rehydrates from localStorage on mount.
  const [widths, setWidths] = useState<PaneWidths>(PANE_DEFAULTS);

  useEffect(() => {
    const stored = readFromStorage();
    if (stored) setWidths(clampPaneWidths(stored));
  }, []);

  const setLeftWidth = useCallback((next: number) => {
    setWidths((prev) => {
      const updated = clampPaneWidths({ ...prev, leftWidth: next });
      writeToStorage(updated);
      return updated;
    });
  }, []);

  const setRightWidth = useCallback((next: number) => {
    setWidths((prev) => {
      const updated = clampPaneWidths({ ...prev, rightWidth: next });
      writeToStorage(updated);
      return updated;
    });
  }, []);

  return {
    leftWidth: widths.leftWidth,
    rightWidth: widths.rightWidth,
    setLeftWidth,
    setRightWidth,
  };
}
