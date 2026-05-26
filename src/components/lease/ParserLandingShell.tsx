// Sprint 26a — Parser-first landing (Mode A) composition root.
//
// Replaces the chat empty state as the user's first read. The hero
// dropzone is the dominant affordance; a 5-step flow strip, the trust
// metrics, and the disclaimer support it. The AssistantFab stub claims
// the bottom-right slot the real FAB will own in Sprint 26c.
//
// State: this shell intentionally does NOT mount LeaseLensWorkspaceShell.
// When upload completes, the parent (`WorkspaceRouterShell` calling
// `router.refresh()` or a setState swap) is responsible for transitioning
// to Mode B. In Sprint 26a the transition path is server-driven: the
// user uploads, /api/leases sets the active-lease cookie, the page
// re-renders, and the router picks the post-upload shell.

'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { LeaseLensMark } from '@/components/brand/LeaseLensMark';
import { AssistantFab } from '@/components/chat/AssistantFab';
import { AssistantFabProvider } from '@/components/chat/AssistantFabContext';
import { ChatStreamProvider } from '@/components/chat/ChatStreamContext';
import type { Role } from '@/lib/auth/types';
import { LEASELENS_DISCLAIMER } from '@/lib/lease/disclaimer';
import { LeaseHeroDropzone } from './LeaseHeroDropzone';
import { LeaseParserProvider } from './LeaseParserContext';
import type { UploadResult } from './LeaseUploadDropzone';

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

const TRUST_METRICS = [
  { numeral: '01', text: '15+ clauses checked' },
  { numeral: '02', text: 'Every flag cites NJSA' },
  { numeral: '03', text: 'Plain-English explanations' },
] as const;

const FLOW_STAGES = [
  'Upload',
  'Parse',
  'Extract clauses',
  'Flag risks',
  'Review',
] as const;

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
        <ChatStreamProvider viewerRole={viewerRole} activeLease={null}>
          <section
            data-testid="parser-landing-shell"
            // Sprint 26c.3 — `justify-center-safe` falls back to flex-start
            // when content overflows the section's height. Plain
            // `justify-center` was causing the eyebrow + badge to bleed
            // above the scroll viewport (and therefore behind the global
            // header) on shorter laptop viewports. Same fix the legacy
            // ChatEmptyState carried for the same reason.
            className="relative flex min-h-0 flex-1 flex-col items-center justify-center-safe gap-10 overflow-y-auto bg-surface-base px-6 py-12 sm:py-16"
          >
            {/* Sprint 26c.5 — brand cluster (eyebrow + badge + wordmark)
              and the hero dropzone live in a tighter sub-stack so the
              wordmark reads as a lockup that introduces the headline,
              rather than a free-floating label 40px away. The outer
              section keeps gap-10 between this unit and the
              flow-strip / trust / disclaimer rows so the page rhythm
              stays calm. */}
            <div className="flex w-full flex-col items-center gap-2">
              <div className="flex flex-col items-center gap-3">
                <p
                  data-testid="parser-landing-eyebrow"
                  className="font-mono text-[10px] tracking-[0.22em] text-fg-subtle uppercase sm:text-[11px]"
                >
                  {workspaceName}
                </p>
                <LeaseHeroBrandBadge />
                {/* Sprint 26c.5–.8 — wordmark mirrors the "negotiate"
                  emphasis in the hero headline (font-serif + italic),
                  stepped to text-3xl (30px) and bolded so the lockup
                  reads at full brand strength. Still subordinate to
                  the text-4xl / text-5xl headline below, so hierarchy
                  is preserved. */}
                <p
                  data-testid="parser-landing-wordmark"
                  className="font-serif font-bold text-3xl text-fg-default italic tracking-tight"
                >
                  LeaseLens
                </p>
              </div>

              <LeaseHeroDropzone
                onUploaded={onUploaded ?? (() => {})}
                conversationId={conversationId ?? null}
              />
            </div>

            <ol
              data-testid="parser-flow-strip"
              aria-label="Parser workflow"
              className="flex max-w-2xl flex-wrap items-baseline justify-center gap-x-3 gap-y-1.5 font-mono text-[10px] tracking-[0.14em] text-fg-subtle uppercase"
            >
              {FLOW_STAGES.map((stage, idx) => (
                <li key={stage} className="inline-flex items-baseline gap-3">
                  <span>{stage}</span>
                  {idx < FLOW_STAGES.length - 1 ? (
                    <span aria-hidden="true" className="text-fg-subtle/50">
                      →
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>

            <div
              data-testid="parser-trust-metrics"
              className="flex max-w-2xl flex-wrap items-baseline justify-center gap-x-3 gap-y-1.5 text-[11px] text-fg-subtle"
            >
              {TRUST_METRICS.map((metric, index) => (
                <span
                  key={metric.text}
                  className="inline-flex items-baseline gap-3 whitespace-nowrap"
                >
                  <span className="inline-flex items-baseline gap-1.5">
                    <span
                      aria-hidden="true"
                      className="font-mono text-[10px] tracking-[0.1em] text-fg-subtle/70"
                    >
                      {metric.numeral}
                    </span>
                    <span>{metric.text}</span>
                  </span>
                  {index < TRUST_METRICS.length - 1 ? (
                    <span aria-hidden="true" className="text-fg-subtle/50">
                      ·
                    </span>
                  ) : null}
                </span>
              ))}
            </div>

            <p
              data-testid="parser-landing-disclaimer"
              className="max-w-md text-balance text-center text-[11px] text-fg-subtle leading-relaxed"
            >
              {LEASELENS_DISCLAIMER}
            </p>

            {children}
          </section>
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
 */
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
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-500 dark:bg-accent-500/15 dark:text-accent-300"
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
    <div
      data-testid="parser-landing-badge"
      className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-500 dark:bg-accent-500/15 dark:text-accent-300"
    >
      <LeaseLensMark size={28} animated={false} />
    </div>
  );
}
