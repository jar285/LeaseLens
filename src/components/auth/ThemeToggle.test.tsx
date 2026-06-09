import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  cycleTheme,
  flipTheme,
  THEME_STORAGE_KEY,
  ThemeToggle,
  themeAccessibleLabel,
} from './ThemeToggle';

function mockMatchMedia(matches: Record<string, boolean>) {
  return vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const prefersDark = query.includes('prefers-color-scheme: dark');
    const prefersReduced = query.includes('prefers-reduced-motion');
    let match = false;
    if (prefersDark) match = matches.dark ?? false;
    if (prefersReduced) match = matches.reducedMotion ?? false;
    return {
      matches: match,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    } as MediaQueryList;
  });
}

describe('theme helpers', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark', 'theme-transition');
    document.documentElement.removeAttribute('data-theme');
    window.localStorage.clear();
    // Sprint 30.1 — vi.restoreAllMocks() does NOT clean up direct property
    // assignments on document, so we delete defensively in every hook.
    delete (document as unknown as { startViewTransition?: unknown })
      .startViewTransition;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (document as unknown as { startViewTransition?: unknown })
      .startViewTransition;
  });

  it('cycles system → light → dark → system (Sprint 15.1)', () => {
    expect(cycleTheme('system')).toBe('light');
    expect(cycleTheme('light')).toBe('dark');
    expect(cycleTheme('dark')).toBe('system');
  });

  it('applyTheme toggles .dark for explicit and system modes', () => {
    mockMatchMedia({ dark: false });
    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    mockMatchMedia({ dark: true });
    applyTheme('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('themeAccessibleLabel includes resolved appearance in system mode', () => {
    expect(themeAccessibleLabel('system', true)).toMatch(/currently dark/i);
    expect(themeAccessibleLabel('system', false)).toMatch(/currently light/i);
    expect(themeAccessibleLabel('light', false)).toMatch(/Theme: light/i);
  });

  it('flipTheme skips theme-transition when prefers-reduced-motion (Sprint 29.x)', () => {
    mockMatchMedia({ dark: false, reducedMotion: true });
    // Sprint 30.1 — stub VT API too so we can prove reduced-motion
    // short-circuits BEFORE the View Transitions branch as well.
    const vt = vi.fn();
    (
      document as unknown as { startViewTransition: typeof vt }
    ).startViewTransition = vt;
    flipTheme('dark');
    expect(
      document.documentElement.classList.contains('theme-transition'),
    ).toBe(false);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(vt).not.toHaveBeenCalled();
  });

  it('flipTheme uses document.startViewTransition when available (Sprint 30.1)', () => {
    mockMatchMedia({ dark: false, reducedMotion: false });
    const vt = vi.fn((cb: () => void) => {
      cb();
      return undefined;
    });
    (
      document as unknown as { startViewTransition: typeof vt }
    ).startViewTransition = vt;
    flipTheme('dark');
    expect(vt).toHaveBeenCalledTimes(1);
    expect(vt).toHaveBeenCalledWith(expect.any(Function));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    // VT path does NOT touch .theme-transition — the browser owns the crossfade.
    expect(
      document.documentElement.classList.contains('theme-transition'),
    ).toBe(false);
  });

  it('flipTheme falls back to double-rAF + class-window when View Transitions API absent (Sprint 30.1)', () => {
    mockMatchMedia({ dark: false, reducedMotion: false });
    // No VT API on document (deleted by beforeEach).
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 1;
      });
    vi.useFakeTimers();
    flipTheme('dark');
    // Double rAF: rule must be in computed style before .dark mutates.
    expect(raf).toHaveBeenCalledTimes(2);
    expect(
      document.documentElement.classList.contains('theme-transition'),
    ).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    vi.advanceTimersByTime(240);
    expect(
      document.documentElement.classList.contains('theme-transition'),
    ).toBe(false);
    raf.mockRestore();
    vi.useRealTimers();
  });
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark', 'theme-transition');
    document.documentElement.removeAttribute('data-theme');
    window.localStorage.clear();
    delete (document as unknown as { startViewTransition?: unknown })
      .startViewTransition;
    mockMatchMedia({ dark: false, reducedMotion: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (document as unknown as { startViewTransition?: unknown })
      .startViewTransition;
  });

  it('persists cycle through localStorage and data-theme-state', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'system');
    render(<ThemeToggle />);
    const button = screen.getByTestId('theme-toggle');
    expect(button).toHaveAttribute('data-theme-state', 'system');

    fireEvent.click(button);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(button).toHaveAttribute('data-theme-state', 'light');

    fireEvent.click(button);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(button).toHaveAttribute('data-theme-state', 'dark');

    fireEvent.click(button);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    expect(button).toHaveAttribute('data-theme-state', 'system');
  });

  it('shows mode chip on md+ and system resolved hint in system mode', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'system');
    mockMatchMedia({ dark: true, reducedMotion: false });
    render(<ThemeToggle />);
    expect(screen.getByTestId('theme-toggle-mode-chip')).toHaveTextContent(
      'SYS',
    );
    expect(screen.getByTestId('theme-toggle-system-hint')).toBeInTheDocument();
    expect(screen.getByTestId('theme-toggle-icons')).toHaveAttribute(
      'data-resolved',
      'dark',
    );
  });

  it('aria-label describes system mode with resolved appearance', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'system');
    mockMatchMedia({ dark: true, reducedMotion: false });
    render(<ThemeToggle />);
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/currently dark/i),
    );
  });
});
