'use client';

/**
 * Sprint 15.1 — three-state theme toggle (system / light / dark) with
 * localStorage persistence and live response to OS preference changes
 * while in system mode. Pairs with the no-FOUC inline script in
 * layout.tsx, which sets the initial .dark class + data-theme attr
 * before first paint.
 *
 * Cycle order (one click): system → light → dark → system. The Monitor
 * icon is the *stored* system mode (match OS), not a bug or extra theme.
 * Sun = light, Moon = dark. In system mode a small resolved hint shows
 * which appearance the OS is driving (Nielsen: visibility of status).
 */

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

export const THEME_STORAGE_KEY = 'leaselens_theme';
const THEME_TRANSITION_MS = 240;

export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

export function isSystemDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function applyTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  const systemDark = isSystemDark();
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.setAttribute('data-theme', theme);
}

export function cycleTheme(theme: Theme): Theme {
  if (theme === 'system') return 'light';
  if (theme === 'light') return 'dark';
  return 'system';
}

/**
 * Sprint 30.1 — three-branch flip:
 *   1. reduced-motion → instant applyTheme (a11y short-circuit)
 *   2. View Transitions API → native snapshot crossfade on Chromium/Safari;
 *      compositor work, ignores DOM node count (fixes Mode A paint storm)
 *   3. fallback → class-window with double-rAF so .theme-transition is in
 *      computed style before .dark mutates (single rAF could miss the
 *      style-commit on some browsers and produce an instant flip)
 */
export function flipTheme(next: Theme): void {
  if (typeof window === 'undefined') return;

  if (prefersReducedMotion()) {
    applyTheme(next);
    return;
  }

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(() => applyTheme(next));
    return;
  }

  const root = document.documentElement;
  root.classList.add('theme-transition');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      applyTheme(next);
      window.setTimeout(
        () => root.classList.remove('theme-transition'),
        THEME_TRANSITION_MS,
      );
    });
  });
}

const CYCLE_HINT = 'Cycles: system, then light, then dark.';

export function themeAccessibleLabel(
  theme: Theme,
  systemDark: boolean,
): string {
  const resolved = systemDark ? 'dark' : 'light';
  if (theme === 'system') {
    return `Theme: system (currently ${resolved}, click for light). ${CYCLE_HINT}`;
  }
  if (theme === 'light') {
    return `Theme: light (click for dark). ${CYCLE_HINT}`;
  }
  return `Theme: dark (click for system). ${CYCLE_HINT}`;
}

function modeChipLabel(theme: Theme): string {
  if (theme === 'system') return 'SYS';
  if (theme === 'light') return 'LIGHT';
  return 'DARK';
}

const ICON_LAYER =
  'absolute inset-0 m-auto h-3.5 w-3.5 transition-opacity duration-200 motion-reduce:transition-none';

function ThemeToggleIcons({
  theme,
  systemDark,
}: {
  theme: Theme;
  systemDark: boolean;
}): React.JSX.Element {
  const showMonitor = theme === 'system';
  const showSun = theme === 'light';
  const showMoon = theme === 'dark';

  return (
    <span
      className="relative h-3.5 w-3.5 shrink-0"
      data-testid="theme-toggle-icons"
      data-resolved={
        theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
      }
    >
      <Monitor
        aria-hidden="true"
        className={`${ICON_LAYER} ${showMonitor ? 'opacity-100' : 'opacity-0'}`}
      />
      <Sun
        aria-hidden="true"
        className={`${ICON_LAYER} ${showSun ? 'opacity-100' : 'opacity-0'}`}
      />
      <Moon
        aria-hidden="true"
        className={`${ICON_LAYER} ${showMoon ? 'opacity-100' : 'opacity-0'}`}
      />
      {showMonitor ? (
        <span
          aria-hidden="true"
          data-testid="theme-toggle-system-hint"
          className="absolute -right-0.5 -bottom-0.5 flex h-2 w-2 items-center justify-center rounded-full bg-surface-card ring-1 ring-border-hairline/80"
        >
          {systemDark ? (
            <Moon className="h-1.5 w-1.5 text-fg-subtle" />
          ) : (
            <Sun className="h-1.5 w-1.5 text-fg-subtle" />
          )}
        </span>
      ) : null}
    </span>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme());
    setSystemDark(isSystemDark());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      setSystemDark(mql.matches);
      applyTheme('system');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  function onClick() {
    const next = cycleTheme(theme);
    setTheme(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    if (next !== 'system') {
      setSystemDark(isSystemDark());
    }
    flipTheme(next);
  }

  const label = mounted ? themeAccessibleLabel(theme, systemDark) : 'Theme';

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Theme"
        title="Theme"
        className="flex h-7 min-h-7 min-w-7 items-center justify-center gap-1.5 rounded-md px-1 text-fg-muted md:min-w-[4.5rem] md:px-2"
      >
        <Monitor className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden font-mono text-[10px] tracking-[0.18em] uppercase md:inline">
          SYS
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="theme-toggle"
      data-theme-state={theme}
      aria-label={label}
      title={label}
      className="flex h-7 min-h-7 min-w-7 items-center justify-center gap-1.5 rounded-md px-1 text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 md:min-w-[4.5rem] md:px-2 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      <ThemeToggleIcons theme={theme} systemDark={systemDark} />
      <span
        data-testid="theme-toggle-mode-chip"
        className="hidden font-mono text-[10px] tracking-[0.18em] text-fg-subtle/80 uppercase md:inline"
      >
        {modeChipLabel(theme)}
      </span>
    </button>
  );
}
