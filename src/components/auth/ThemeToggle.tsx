'use client';

/**
 * Sprint 15.1 — three-state theme toggle (system / light / dark) with
 * localStorage persistence and live response to OS preference changes
 * while in system mode. Pairs with the no-FOUC inline script in
 * layout.tsx, which sets the initial .dark class + data-theme attr
 * before first paint.
 *
 * Cycle order (one click): system → light → dark → system. The icon
 * mirrors the *resolved* theme so users in system mode on a dark OS
 * see a moon, not a monitor.
 */

import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
const STORAGE_KEY = 'leaselens_theme';

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }
  return 'system';
}

function applyTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = theme === 'dark' || (theme === 'system' && systemDark);
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.setAttribute('data-theme', theme);
}

function cycle(theme: Theme): Theme {
  if (theme === 'system') return 'light';
  if (theme === 'light') return 'dark';
  return 'system';
}

export function ThemeToggle() {
  // Read on mount so SSR doesn't read localStorage. The inline script in
  // layout.tsx already painted the right state before this component
  // hydrates, so there's no FOUC.
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(readStoredTheme());
    setMounted(true);
  }, []);

  // While in system mode, react to OS preference changes.
  useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  function onClick() {
    const next = cycle(theme);
    setTheme(next);
    window.localStorage.setItem(STORAGE_KEY, next);

    // Sprint 15.2 — temporarily enable cross-tree colour transitions so
    // the .dark flip crossfades over ~220ms instead of jumping. The
    // class is removed slightly after the transition window closes so
    // a fast double-click still gets the smooth flip. Per-element
    // hover/focus animations keep their own timings outside this
    // window because the rule no longer matches.
    const root = document.documentElement;
    root.classList.add('theme-transition');
    applyTheme(next);
    window.setTimeout(() => root.classList.remove('theme-transition'), 240);
  }

  // Resolved appearance for the icon — system mode shows whichever
  // scheme the OS resolves to, so the icon reads as "what you see".
  const resolvedDark =
    mounted &&
    (theme === 'dark' ||
      (theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches));

  // Render a placeholder during SSR + the first hydration tick so the
  // server-rendered HTML matches the client tree.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Theme"
        className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted opacity-0"
      >
        <Monitor className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    );
  }

  const Icon = theme === 'system' ? Monitor : resolvedDark ? Moon : Sun;
  const labelMap: Record<Theme, string> = {
    system: 'Theme: system (click for light)',
    light: 'Theme: light (click for dark)',
    dark: 'Theme: dark (click for system)',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      data-theme-state={theme}
      aria-label={labelMap[theme]}
      title={labelMap[theme]}
      className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
