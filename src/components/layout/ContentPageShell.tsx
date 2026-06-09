// Sprint 41 — shared chrome for the static content pages (/faq, /privacy,
// /sources). A slim brand-lockup-links-home banner + an editorial title block
// + the shared SiteFooter. It intentionally does NOT reuse the global
// masthead from app/page.tsx (that header is coupled to session role,
// LEASELENS_DEMO_MODE, the version stamp, and the role switcher) — content
// pages are a calm secondary surface and carry no such controls. Directive-
// less so it renders as a server component for the (sync) content pages.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LeaseLensMark } from '@/components/brand/LeaseLensMark';
import { LEASELENS_WORDMARK_MASTHEAD } from '@/components/brand/wordmark-classes';
import { SiteFooter } from './SiteFooter';

export interface ContentPageShellProps {
  /** Mono eyebrow above the title (e.g. "Frequently asked"). */
  eyebrow: string;
  /** The page H1. */
  title: string;
  /** Optional lead paragraph under the title. */
  intro?: string;
  children: ReactNode;
}

export function ContentPageShell({
  eyebrow,
  title,
  intro,
  children,
}: ContentPageShellProps): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-surface-base font-sans text-fg-default">
      <header className="sticky top-0 z-raised flex shrink-0 items-center border-b border-border-hairline bg-surface-card px-6 py-4 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-3 rounded-md transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-600 text-white shadow-hairline">
            <LeaseLensMark className="h-5 w-5" animated={false} />
          </span>
          <span className={LEASELENS_WORDMARK_MASTHEAD}>LeaseLens</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:px-8 sm:py-16">
        <div className="flex flex-col gap-3 border-b border-border-hairline/70 pb-8">
          <p className="font-mono text-[11px] text-accent-600 tracking-[0.22em] uppercase dark:text-accent-400">
            {eyebrow}
          </p>
          <h1 className="font-serif text-3xl font-bold text-fg-default tracking-tight sm:text-4xl">
            {title}
          </h1>
          {intro ? (
            <p className="max-w-2xl text-base text-fg-muted leading-relaxed">
              {intro}
            </p>
          ) : null}
        </div>
        <div className="mt-8">{children}</div>
      </main>

      {/* Sprint 42 — content pages have no masthead toggle, so the footer
          carries the theme control here (the landing omits it — its masthead
          already has one). */}
      <SiteFooter showThemeToggle />
    </div>
  );
}
