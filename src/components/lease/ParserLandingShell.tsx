// Sprint 26a — Parser-first landing (Mode A) composition root.
//
// Replaces the chat empty state as the user's first read. The hero
// dropzone is the dominant affordance; a 5-step flow strip, the trust
// metrics, and the disclaimer support it. The AssistantFab stub claims
// the bottom-right slot the real FAB will own in Sprint 26c.
//
// State: this shell intentionally does NOT render the post-upload workspace
// itself. When upload completes, the parent (`WorkspaceRouterShell`) is
// responsible for transitioning to Mode B (`ParserResultsShell`). In Sprint 26a
// the transition path is server-driven: the
// user uploads, /api/leases sets the active-lease cookie, the page
// re-renders, and the router picks the post-upload shell.

'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Children, type ReactNode, useEffect, useState } from 'react';
import { LeaseLensMark } from '@/components/brand/LeaseLensMark';
import { AssistantFab } from '@/components/chat/AssistantFab';
import { AssistantFabProvider } from '@/components/chat/AssistantFabContext';
import { ChatStreamProvider } from '@/components/chat/ChatStreamContext';
import { SiteFooter } from '@/components/layout/SiteFooter';
import type { Role } from '@/lib/auth/types';
import { LEASELENS_DISCLAIMER } from '@/lib/lease/disclaimer';
import {
  LEASELENS_CAPABILITIES_PANEL,
  LEASELENS_CAPABILITY_PILLS,
  LEASELENS_DATA_PANEL,
} from '@/lib/lease/landing-panels';
import { LEASELENS_TRUST_METRICS } from '@/lib/lease/trust-metrics';
import { EASE_OUT_SOFT } from '@/lib/motion/presets';
import { LandingPageRails } from './LandingPageRails';
import { LeaseHeroDropzone } from './LeaseHeroDropzone';
import { LeaseParserProvider } from './LeaseParserContext';
import type { UploadResult } from './LeaseUploadDropzone';
import { ParserLandingEditorialFrame } from './ParserLandingEditorialRails';

export interface ParserLandingShellProps {
  workspaceName: string;
  viewerRole?: Role;
  conversationId?: string | null;
  /**
   * Sprint 26a — the upload handler is forwarded to the hero dropzone.
   * Default is a noop because in production the dropzone's own
   * post-success behavior (server cookie + page revalidate) drives the
   * mode swap. Tests pass a spy to verify forwarding without exercising
   * the full upload pipeline.
   */
  onUploaded?: (result: UploadResult, file: File) => void;
  /**
   * Optional extra subtree mounted inside the provider so unit tests
   * can probe `useChatStream` from a descendant.
   */
  children?: React.ReactNode;
}

const FLOW_STAGES = [
  { numeral: '01', label: 'Upload' },
  { numeral: '02', label: 'Parse' },
  { numeral: '03', label: 'Extract clauses' },
  { numeral: '04', label: 'Flag risks' },
  { numeral: '05', label: 'Review' },
] as const;

/*
 * Sprint 29.x — Gemini-style ambient field for Mode A landing.
 *
 * Soft terracotta glow centered behind the hero lockup (not a literal
 * shape). Mirrors ChatEmptyState's accent orb but scales up for the
 * full landing viewport and layers a radial wash + two blurred ellipses
 * so the cream page reads as depth rather than flat fill. Pure CSS,
 * no motion — reduced-motion users see the same static atmosphere.
 *
 * The landing `<section>` uses `isolate` so this layer's `-z-10` paints
 * above the section's cream background but below in-flow hero content.
 * Without `isolate`, negative z-index children fall behind the parent's
 * `bg-surface-base` and the blob is invisible.
 *
 * Colors come from `--color-accent-ambient-*` tokens in globals.css so
 * dark mode never inherits light-mode accent-200 peach values.
 */
function LeaseHeroAmbientBlob(): React.JSX.Element {
  return (
    <div
      data-testid="parser-landing-hero-blob"
      data-theme-layer="ambient"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <div
        data-testid="parser-landing-hero-blob-gradient"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 40%, color-mix(in srgb, var(--color-accent-ambient-core) var(--accent-ambient-gradient-mix), transparent), transparent 68%)',
        }}
      />
      <div className="absolute top-[38%] left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <div
          className="h-[min(28rem,70vh)] w-[min(36rem,92vw)] rounded-full blur-[100px]"
          style={{
            background:
              'color-mix(in srgb, var(--color-accent-ambient-core) var(--accent-ambient-ellipse-opacity), transparent)',
          }}
        />
      </div>
      <div
        className="absolute top-[46%] left-[58%] h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            'color-mix(in srgb, var(--color-accent-ambient-soft) var(--accent-ambient-soft-opacity), transparent)',
        }}
      />
      <div
        className="absolute top-[34%] left-[42%] h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            'color-mix(in srgb, var(--color-accent-ambient-core) calc(var(--accent-ambient-soft-opacity) * 0.85), transparent)',
        }}
      />
      {/* Sprint 29.x — fade the blob toward the dropzone tray so terracotta
          glow + upload surface read as one calm field, not two stacked layers. */}
      <div
        data-testid="parser-landing-hero-blob-fade"
        className="absolute inset-x-0 bottom-0 h-[48%]"
        style={{
          background:
            'linear-gradient(to bottom, transparent, color-mix(in srgb, var(--color-surface-base) var(--accent-ambient-fade-mix), transparent))',
        }}
      />
    </div>
  );
}

const CAPABILITY_PILL_CLASS =
  'inline-flex cursor-default rounded-full border border-border-hairline bg-surface-elevated/55 px-3 py-1.5 text-xs font-medium text-fg-default shadow-hairline transition-[background-color,border-color,color,transform] duration-200 ease-out motion-safe:[@media(hover:hover)]:hover:scale-[1.02] motion-safe:[@media(hover:hover)]:hover:border-accent-400/70 motion-safe:[@media(hover:hover)]:hover:bg-accent-50/75 motion-safe:[@media(hover:hover)]:hover:text-accent-700 motion-reduce:transition-none motion-reduce:hover:scale-100 dark:bg-surface-elevated/25 dark:motion-safe:[@media(hover:hover)]:hover:border-accent-500/45 dark:motion-safe:[@media(hover:hover)]:hover:bg-accent-500/12 dark:motion-safe:[@media(hover:hover)]:hover:text-accent-200';

// Sprint 41 — the trust-metric medallions are the landing's one glass
// accent (the user's "numbers we use as signs"). Reuses the FAB drawer's
// frosted recipe — translucent warm parchment + backdrop blur, with a
// backdrop-filter-aware opacity step-down so non-supporting browsers get a
// more opaque (readable) fallback. Depth comes from an inset top highlight
// + a soft warm drop shadow (box-shadow rather than a `before:` line, which
// reads cleaner on a circle). The hover lift transitions the `scale`
// property — NOT `transform` — because Tailwind v4 sets `scale`/`translate`
// as their own CSS properties; the old `transition-transform` never animated
// the lift and it snapped.
const TRUST_METRIC_CIRCLE_CLASS =
  'flex h-14 w-14 items-center justify-center rounded-full border border-border-hairline bg-surface-card/80 font-mono text-lg text-accent-700 tabular-nums shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_6px_16px_-8px_rgb(40_28_16/0.22)] backdrop-blur-md transition-[scale,box-shadow] duration-200 ease-out supports-[backdrop-filter]:bg-surface-card/65 motion-safe:[@media(hover:hover)]:hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100 dark:bg-neutral-900/70 dark:text-accent-300 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.10),0_6px_16px_-8px_rgb(0_0_0/0.5)] dark:supports-[backdrop-filter]:bg-neutral-900/55';

const HERO_ENTRANCE_ITEM = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: EASE_OUT_SOFT },
  },
} as const;

function ParserLandingTrustMetric({
  numeral,
  text,
}: {
  numeral: string;
  text: string;
}): React.JSX.Element {
  return (
    <div
      data-testid="parser-trust-metric"
      className="flex min-w-[6.5rem] max-w-[8.5rem] flex-col items-center gap-2 text-center"
    >
      <div
        aria-hidden="true"
        data-testid="parser-trust-metric-circle"
        className={TRUST_METRIC_CIRCLE_CLASS}
      >
        {numeral}
      </div>
      <p className="text-[10px] text-fg-subtle leading-snug tracking-wide uppercase sm:text-[11px]">
        {text}
      </p>
    </div>
  );
}

/*
 * Sprint 29.x — CloudConvert-style below-fold band: capability pills +
 * privacy panel. Read-only; upload remains the only action.
 */
function ParserLandingScrollPanels(): React.JSX.Element {
  return (
    <div
      data-testid="parser-landing-panels"
      className="relative z-0 grid w-full max-w-3xl grid-cols-1 gap-8 border-t border-border-hairline/70 pt-10 sm:grid-cols-2 sm:gap-10"
    >
      <article
        data-testid="parser-landing-panel-capabilities"
        className="flex flex-col gap-3 text-left"
      >
        <p className="font-mono text-[10px] text-accent-600 tracking-[0.22em] uppercase dark:text-accent-400">
          {LEASELENS_CAPABILITIES_PANEL.eyebrow}
        </p>
        <h2 className="font-serif text-xl font-bold text-fg-default tracking-tight sm:text-2xl">
          {LEASELENS_CAPABILITIES_PANEL.headline}
        </h2>
        <p className="text-sm text-fg-muted leading-relaxed">
          {LEASELENS_CAPABILITIES_PANEL.body}
        </p>
        <ul
          data-testid="parser-landing-capability-pills"
          className="mt-1 flex flex-wrap gap-2"
          aria-label="Parser outputs"
        >
          {LEASELENS_CAPABILITY_PILLS.map((pill) => (
            <li key={pill.id}>
              <span
                data-testid="parser-landing-capability-pill"
                className={CAPABILITY_PILL_CLASS}
              >
                {pill.label}
              </span>
            </li>
          ))}
        </ul>
      </article>

      <article
        data-testid="parser-landing-panel-privacy"
        className="flex flex-col gap-3 text-left"
      >
        <p className="font-mono text-[10px] text-accent-600 tracking-[0.22em] uppercase dark:text-accent-400">
          {LEASELENS_DATA_PANEL.eyebrow}
        </p>
        <h2 className="font-serif text-xl font-bold text-fg-default tracking-tight sm:text-2xl">
          {LEASELENS_DATA_PANEL.headline}
        </h2>
        <p className="text-sm text-fg-muted leading-relaxed">
          {LEASELENS_DATA_PANEL.body}
        </p>
      </article>
    </div>
  );
}

/*
 * Sprint 29.x — Open Design–style staggered reveal on Mode A hero.
 * Two beats: brand lockup, then dropzone. Reduced motion + SSR render
 * the static tree (same mount gate as LeaseHeroBrandBadge).
 */
function LeaseHeroEntrance({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): React.JSX.Element {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const animate = mounted && !reduced;

  if (!animate) {
    return (
      <div
        data-testid="parser-landing-hero-entrance"
        data-motion="static"
        className={className}
      >
        {children}
      </div>
    );
  }

  return (
    <motion.div
      data-testid="parser-landing-hero-entrance"
      data-motion="animated"
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        visible: { transition: { staggerChildren: 0.07 } },
      }}
    >
      {Children.map(children, (child) =>
        child ? (
          <motion.div
            key={
              typeof child === 'object' && child !== null && 'key' in child
                ? String(child.key)
                : undefined
            }
            variants={HERO_ENTRANCE_ITEM}
            className="flex w-full flex-col items-center"
          >
            {child}
          </motion.div>
        ) : null,
      )}
    </motion.div>
  );
}

/*
 * Sprint 26c.1 — hero brand badge.
 *
 * Mirrors the legacy ChatEmptyState badge: a rounded-2xl 12×12 surface
 * tinted with `bg-accent-50` (dark: `bg-accent-500/15`) carrying the
 * bespoke LeaseLensMark at 28px. The outer badge does a 4-second
 * "breathing" pulse on scale + opacity (calm "AI is alive" cue); the
 * mark inside scans once on mount and then re-shimmers every ~14s at
 * low opacity via the `idleShimmer` prop. Reduced motion skips both
 * animations and renders the static mark, matching the empty-state
 * contract from earlier sprints.
 *
 * Sprint 49 — premium lift, in the hero's OWN register (deliberately NOT
 * the masthead's solid terracotta tile, which would fight the ambient glow
 * behind the lockup). Stays pale + accent-glyphed (airy first impression),
 * and gains depth the same way the trust-metric medallions do: a subtle
 * within-family gradient (accent-50 → accent-100), an inset top highlight
 * (catch-light), a soft warm lift shadow, and a hairline edge. Glyph stays
 * accent-coloured and crisp (Wathan/Schoger depth, Dieter Rams restraint;
 * readability preserved per ui-ux-philosophy). Shared by both the animated
 * and static branches so they can't drift.
 */
const HERO_BADGE_CLASS =
  'flex h-12 w-12 items-center justify-center rounded-2xl border border-border-hairline bg-gradient-to-br from-accent-50 to-accent-100 text-accent-500 shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_8px_20px_-10px_rgb(40_28_16/0.25)] dark:border-accent-500/20 dark:from-accent-500/15 dark:to-accent-500/25 dark:text-accent-300 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_8px_20px_-10px_rgb(0_0_0/0.55)]';
function LeaseHeroBrandBadge(): React.JSX.Element {
  const reduced = useReducedMotion();
  // Mount gate avoids a hydration mismatch — the first SSR pass renders
  // the static branch (no `motion.div`), and the client takes over
  // after mount to layer animations on top.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const animate = mounted && !reduced;

  if (animate) {
    return (
      <motion.div
        aria-hidden="true"
        data-testid="parser-landing-badge"
        className={HERO_BADGE_CLASS}
        animate={{ scale: [1, 1.04, 1], opacity: [0.9, 1, 0.9] }}
        transition={{
          duration: 4,
          ease: 'easeInOut',
          repeat: Number.POSITIVE_INFINITY,
        }}
      >
        <LeaseLensMark size={28} idleShimmer />
      </motion.div>
    );
  }
  return (
    <div data-testid="parser-landing-badge" className={HERO_BADGE_CLASS}>
      <LeaseLensMark size={28} animated={false} />
    </div>
  );
}

export function ParserLandingShell({
  workspaceName,
  viewerRole,
  conversationId,
  onUploaded,
  children,
}: ParserLandingShellProps): React.JSX.Element {
  return (
    <AssistantFabProvider>
      <LeaseParserProvider activeLease={null}>
        <ChatStreamProvider viewerRole={viewerRole}>
          <section
            data-testid="parser-landing-shell"
            data-theme-surface
            // Sprint 26c.3 — `justify-center-safe` falls back to flex-start
            // when content overflows the section's height. Plain
            // `justify-center` was causing the eyebrow + badge to bleed
            // above the scroll viewport (and therefore behind the global
            // header) on shorter laptop viewports. Same fix the legacy
            // ChatEmptyState carried for the same reason.
            // Sprint 29.x — window owns scroll (page.tsx min-h-screen); no
            // overflow-y-auto here or sticky rails lose their scroll ancestor.
            className="parser-landing-shell relative isolate bg-surface-base px-4 py-12 sm:px-6 sm:py-16 lg:px-8"
          >
            <LeaseHeroAmbientBlob />

            {/* Sprint 29.13 — rails moved OUT of the hero grid into the
                page-shell-level `LandingPageRails` (fixed positioning).
                The grid drops its 3-column template and reverts to a
                single column of central content; the rails are now
                viewport metadata, not section decoration. */}
            <LandingPageRails />
            {/* Sprint 29.x — editorial frame sits higher than the hero wrapper,
                so the caption + hairline read as page metadata, not content. */}
            <div className="pointer-events-none absolute inset-x-4 top-4 z-0 mx-auto w-full max-w-6xl sm:inset-x-6 lg:inset-x-8">
              <div className="relative h-0">
                <ParserLandingEditorialFrame workspaceName={workspaceName} />
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-6xl">
              <div
                data-testid="parser-landing-grid"
                className="relative z-10 grid w-full grid-cols-1 gap-y-10"
              >
                <div className="flex min-w-0 flex-col items-center justify-center-safe gap-10 px-2 pt-8 sm:px-4 sm:pt-10">
                  {/* Sprint 29.x — workspace eyebrow lives on the editorial frame
                      hairline (ParserLandingEditorialFrame); badge + headline only. */}
                  <LeaseHeroEntrance className="relative z-0 flex w-full flex-col items-center gap-2">
                    <div className="flex flex-col items-center gap-3">
                      <LeaseHeroBrandBadge />
                    </div>

                    <LeaseHeroDropzone
                      onUploaded={onUploaded ?? (() => {})}
                      conversationId={conversationId ?? null}
                    />
                  </LeaseHeroEntrance>

                  <div
                    id="how-it-works"
                    data-testid="parser-landing-support"
                    // Sprint 42 — anchor target for the footer "How it works"
                    // link (/#how-it-works). scroll-mt clears the sticky header.
                    className="relative z-0 flex w-full max-w-2xl scroll-mt-24 flex-col items-center gap-8 border-t border-border-hairline/70 pt-10"
                  >
                    <div className="flex w-full flex-col items-center gap-4">
                      <p
                        data-testid="parser-landing-support-label"
                        className="font-mono text-[10px] text-fg-subtle tracking-[0.22em] uppercase"
                      >
                        How it works
                      </p>
                      <ol
                        data-testid="parser-flow-strip"
                        aria-label="Parser workflow"
                        className="flex max-w-2xl flex-wrap items-baseline justify-center gap-x-2 gap-y-2 font-mono text-[10px] text-fg-subtle tracking-[0.12em] uppercase sm:gap-x-3 sm:text-[11px]"
                      >
                        {FLOW_STAGES.map((stage, idx) => (
                          <li
                            key={stage.label}
                            className="inline-flex items-baseline gap-2"
                          >
                            <span
                              aria-hidden="true"
                              className="tabular-nums text-accent-600/90 dark:text-accent-400/90"
                            >
                              {stage.numeral}
                            </span>
                            <span>{stage.label}</span>
                            {idx < FLOW_STAGES.length - 1 ? (
                              <span
                                aria-hidden="true"
                                className="text-fg-subtle/45"
                              >
                                →
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </div>

                    <div
                      data-testid="parser-trust-metrics"
                      className="flex max-w-2xl flex-wrap items-start justify-center gap-6 sm:gap-8"
                    >
                      {LEASELENS_TRUST_METRICS.map((metric) => (
                        <ParserLandingTrustMetric
                          key={metric.text}
                          numeral={metric.numeral}
                          text={metric.text}
                        />
                      ))}
                    </div>
                  </div>

                  <ParserLandingScrollPanels />

                  <p
                    data-testid="parser-landing-disclaimer"
                    className="relative z-0 max-w-md text-balance text-center text-[11px] text-fg-subtle leading-relaxed"
                  >
                    {LEASELENS_DISCLAIMER}
                  </p>

                  {children}
                </div>
              </div>
            </div>
          </section>
          {/* Sprint 41 — site footer (FAQ / Privacy / NJ sources). A sibling
              of the hero section, not inside its scrollable content, so it
              reads as page chrome below the fold and never competes with the
              dropzone. Mode A only — WorkspaceRouterShell swaps to
              ParserResultsShell post-upload. */}
          <SiteFooter />
          <AssistantFab
            workspaceName={workspaceName}
            conversationId={conversationId ?? null}
            initialMessages={[]}
          />
        </ChatStreamProvider>
      </LeaseParserProvider>
    </AssistantFabProvider>
  );
}
