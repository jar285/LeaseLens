'use client';

// Sprint 41/42 — site footer for the Mode A landing + the content pages.
// Calm-minimal: hairline top divider on flat parchment, mono column eyebrows,
// serif/sans body — NO glass (the glass accent is reserved for the trust-badge
// medallions). Sprint 42 grouped the links into Product / Resources / Legal
// columns + a verified external "Tenant help" column, and added a theme toggle
// gated behind `showThemeToggle` (content pages pass it; the landing omits it
// because its masthead already carries one — avoids two desyncing toggles).
//
// It's a client component because the same-page links (Upload a lease → top,
// How it works → #how-it-works) scroll smoothly rather than jumping; a server
// component imported into the (client) ParserLandingShell or a server content
// page renders fine either way.

import { ArrowUpRight, Check } from 'lucide-react';
import Link from 'next/link';
import {
  prefersReducedMotion,
  ThemeToggle,
} from '@/components/auth/ThemeToggle';
import { LeaseLensMark } from '@/components/brand/LeaseLensMark';
import { LEASELENS_WORDMARK_BASE } from '@/components/brand/wordmark-classes';
import { LEASELENS_FOOTER } from '@/lib/content/footer';
import { LEASELENS_TENANT_HELP } from '@/lib/content/tenant-help';
import { LEASELENS_DISCLAIMER } from '@/lib/lease/disclaimer';
import { LEASELENS_TRUST_METRICS } from '@/lib/lease/trust-metrics';

const COLUMN_EYEBROW =
  'font-mono text-[10px] text-accent-600 tracking-[0.22em] uppercase dark:text-accent-400';
const FOOTER_LINK =
  'inline-flex min-h-11 items-center gap-1 rounded-sm text-sm text-fg-default transition-colors hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:hover:text-accent-300';

// Sprint 42 — smooth in-page scroll for the footer's same-page links instead
// of the browser's instant jump. "Upload a lease" (/) glides to the top of the
// landing; "How it works" (/#how-it-works) glides to that section. Both only
// intercept when the target is on the current page — cross-page clicks fall
// through to normal navigation. Reduced-motion → instant (no animation).
function handleInPageScroll(
  event: React.MouseEvent<HTMLAnchorElement>,
  href: string,
): void {
  if (typeof window === 'undefined') return;
  const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';

  if (href === '/') {
    if (window.location.pathname === '/') {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior });
    }
    return;
  }

  if (href.startsWith('/#')) {
    const target = document.getElementById(href.slice(2));
    if (target) {
      event.preventDefault();
      target.scrollIntoView({ behavior, block: 'start' });
      window.history.pushState(null, '', href);
    }
  }
}

export interface SiteFooterProps {
  /**
   * Render the theme toggle in the footer. Content pages pass `true` (their
   * header has no toggle); the landing omits it (its masthead already has one).
   */
  showThemeToggle?: boolean;
}

export function SiteFooter({
  showThemeToggle = false,
}: SiteFooterProps): React.JSX.Element {
  // Resolved at render so the copyright never goes stale.
  const year = new Date().getFullYear();

  return (
    <footer
      data-testid="site-footer"
      className="border-t border-border-hairline bg-surface-base px-6 py-10 sm:px-8"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between lg:gap-16">
          <div className="flex max-w-sm flex-col gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-600 text-white shadow-hairline">
                <LeaseLensMark size={16} animated={false} />
              </span>
              <span className={`${LEASELENS_WORDMARK_BASE} text-base`}>
                LeaseLens
              </span>
            </div>
            <p className="text-sm text-fg-muted leading-relaxed">
              {LEASELENS_FOOTER.tagline}
            </p>
            {/* Sprint 41 — trust-metric highlights, single-source from
                trust-metrics.ts (can't drift from the landing badges). */}
            <ul
              aria-label="What LeaseLens checks"
              className="mt-2 flex flex-col gap-1.5"
            >
              {LEASELENS_TRUST_METRICS.map((metric) => (
                <li
                  key={metric.text}
                  className="flex items-center gap-2 text-[13px] text-fg-muted"
                >
                  <Check
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 text-accent-600 dark:text-accent-400"
                  />
                  <span>{metric.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4 lg:gap-x-12"
          >
            {LEASELENS_FOOTER.columns.map((column) => (
              <div key={column.id} className="flex flex-col gap-1">
                <p className={COLUMN_EYEBROW}>{column.label}</p>
                <ul className="flex flex-col">
                  {column.links.map((link) => (
                    <li key={link.id}>
                      <Link
                        href={link.href}
                        className={FOOTER_LINK}
                        onClick={(event) =>
                          handleInPageScroll(event, link.href)
                        }
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="flex flex-col gap-1">
              <p className={COLUMN_EYEBROW}>{LEASELENS_TENANT_HELP.label}</p>
              <ul className="flex flex-col">
                {LEASELENS_TENANT_HELP.links.map((link) => (
                  <li key={link.id}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={FOOTER_LINK}
                    >
                      {link.label}
                      <ArrowUpRight
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 text-fg-subtle"
                      />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>

        <div className="flex flex-col gap-3 border-t border-border-hairline/60 pt-6 text-[11px] text-fg-muted leading-relaxed sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <p className="max-w-2xl text-balance">{LEASELENS_DISCLAIMER}</p>
          <div className="flex shrink-0 items-center gap-4">
            <p>
              © {year} {LEASELENS_FOOTER.copyrightName}
            </p>
            {showThemeToggle ? <ThemeToggle /> : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
