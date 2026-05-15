'use client';

import { AlertTriangle, FileText, Info, Mail, ScrollText } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { LeaseLensMark } from '@/components/brand/LeaseLensMark';
import { LEASELENS_DISCLAIMER } from '@/lib/lease/disclaimer';
import { EASE_OUT_SOFT, SPRING_SNAPPY } from '@/lib/motion/presets';

interface SuggestedPrompt {
  label: string;
  description: string;
  prompt: string;
  Icon: typeof FileText;
}

// Sprint 13 §3f — LeaseLens empty-state prompts. Replace the
// ContentOps-era brand-onboarding cards with lease-review starters.
// The first card is the headline scan flow; the others are common
// follow-up questions a tenant or reviewer would ask. Labels are
// stable identifiers — copy revisions live in the hero headline +
// subhead instead.
function buildSuggestedPrompts(_workspaceName: string): SuggestedPrompt[] {
  return [
    {
      label: 'Run the standard scan',
      description: 'Extract clauses and grade each against NJ tenant law.',
      prompt:
        'Run the standard scan on my active lease — extract the clauses, grade each against NJ tenant law, and list the red flags.',
      Icon: AlertTriangle,
    },
    {
      label: 'Explain a lease term',
      description: 'Plain-English breakdown grounded in NJ statutes.',
      prompt:
        'Explain the security-deposit cap and return rules under NJ tenant law in plain English.',
      Icon: ScrollText,
    },
    {
      label: 'Compare to NJ statute',
      description: 'Cite the supporting NJ statute for any clause.',
      prompt:
        'For each clause you grade, cite the supporting NJ statute and quote the relevant section verbatim.',
      Icon: FileText,
    },
    {
      label: 'Draft a negotiation email',
      description: 'Polite landlord email; you review before sending.',
      prompt:
        'Draft a polite negotiation email to the landlord about the most concerning clause in my lease.',
      Icon: Mail,
    },
  ];
}

// Sprint 23g — credibility metric strip. Replaces the four-step
// "How it works" process strip with three short proof-points, in the
// register of Cluely's hero metrics (e.g. "300ms response · 95%
// accuracy") and open-design.ai's editorial-declarative voice. The
// goal is to set credibility through specifics, not adjectives.
// Sprint 23i — switched the section markers from Roman numerals to
// Arabic zero-padded (01 · 02 · 03) after the user shared the actual
// Open Design reference, which uses Arabic numerals throughout
// ("01 / OD-26", "01 DETECT 02 DISCOVER ..."). Reads as editorial
// section numbering, not as ordinal priority.
const TRUST_METRICS = [
  { numeral: '01', text: '15+ clauses checked' },
  { numeral: '02', text: 'Every flag cites NJSA' },
  { numeral: '03', text: 'Plain-English explanations' },
] as const;

interface ChatEmptyStateProps {
  workspaceName: string;
  onSelectPrompt?: (prompt: string) => void;
}

export function ChatEmptyState({
  workspaceName,
  onSelectPrompt,
}: ChatEmptyStateProps) {
  const prompts = buildSuggestedPrompts(workspaceName);
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const animate = mounted && !reduced;

  return (
    <div
      // `justify-center-safe` (Tailwind v4) falls back to flex-start when
      // the content is taller than the container. With plain `justify-center`
      // the welcome state overflowed symmetrically on shorter viewports —
      // the hero ended up at a negative y inside the scroll wrapper, so
      // neither the auto-scroll-to-bottom nor an upward wheel could bring
      // it back. The safe variant pins the top to 0 when overflowing and
      // centres only when there's room.
      className="relative flex min-h-[60vh] w-full flex-1 flex-col items-center justify-center-safe px-6 py-12 text-center"
      data-testid="chat-empty-state"
    >
      {/* Sprint 23g — decorative gradient field behind the lockup. Soft
          accent glow at low opacity, blurred so it reads as ambient
          depth rather than a stamp. Pure CSS radial-effect via blur;
          no extra paint nodes. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center overflow-hidden"
      >
        <div className="-translate-y-1/4 mt-2 h-56 w-56 rounded-full bg-accent-300/20 blur-3xl dark:bg-accent-500/15" />
      </div>

      {/* Sprint 23g — editorial eyebrow. Surfaces the workspaceName in
          a mono small-caps register (open-design.ai-style technical
          typeface) above the brand badge. Kept short and quiet so the
          Hero headline below carries the visual weight. */}
      <p
        data-testid="chat-empty-eyebrow"
        className="mb-4 font-mono text-[10px] tracking-[0.22em] text-fg-muted uppercase sm:text-[11px]"
      >
        {workspaceName}
      </p>

      {/*
        Sprint 17.2 — welcome hero now carries the real brand mark
        instead of lucide's generic Sparkles. The outer badge keeps its
        4-second "breathing" pulse (calm "AI is alive" cue); the mark
        inside scans once on its own mount and then rests. The two
        animations stack: continuous gentle pulse on the surface +
        one-shot scan inside.
        Sprint 23g — the hero badge now opts into LeaseLensMark's
        ambient `idleShimmer`, so after the mount scan the mark
        re-shimmers every ~14s at low opacity. Reads as "alive,
        breathing" rather than blinking.
      */}
      {animate ? (
        <motion.div
          aria-hidden="true"
          data-testid="chat-empty-badge"
          className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-500 dark:bg-accent-500/15 dark:text-accent-300"
          animate={{ scale: [1, 1.04, 1], opacity: [0.9, 1, 0.9] }}
          transition={{
            duration: 4,
            ease: 'easeInOut',
            repeat: Number.POSITIVE_INFINITY,
          }}
        >
          <LeaseLensMark size={28} idleShimmer />
        </motion.div>
      ) : (
        <div
          data-testid="chat-empty-badge"
          className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-50 text-accent-500 dark:bg-accent-500/15 dark:text-accent-300"
        >
          <LeaseLensMark size={28} animated={false} />
        </div>
      )}

      {/* Sprint 23g — Hero value-prop headline. Replaces the prior
          workspaceName-as-H1 (now demoted to eyebrow). Editorial serif
          (Source Serif 4), direct, second-person — close to Cluely's
          confident-but-grounded register without the gunslinging
          ("undetectable") edge that doesn't fit a legal-aid tool.
          Sprint 23i — bumped to weight 700 + italic emphasis on
          "negotiate" to match Open Design's display-serif hero
          treatment ("Designing /intelligence/ with skills, /taste,/
          and code."). Italic is rendered from the loaded italic face,
          not browser-synthesised. */}
      <h2
        data-testid="chat-empty-headline"
        className="mb-3 max-w-md text-balance font-serif font-bold text-2xl text-fg-default tracking-tight sm:text-3xl"
      >
        Find what to <em className="font-normal italic">negotiate</em>, before
        you sign.
      </h2>

      {/* Sprint 23h — aphoristic subhead. Keeps the load-bearing
          instruction ("Drop your NJ residential lease in the left
          pane.") so first-time users still know what to do, then
          shifts into open-design.ai's three-part declarative rhythm
          for the value-prop tail. */}
      <p
        data-testid="chat-empty-subhead"
        className="mb-8 max-w-sm text-[14px] leading-relaxed text-fg-muted"
      >
        Drop your NJ residential lease in the left pane. Every clause checked,
        every statute cited, every red flag turned into a polite email.
      </p>

      {animate ? (
        <motion.div
          className="grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.06 } },
          }}
        >
          {prompts.map(({ label, description, prompt, Icon }) => (
            <motion.button
              key={label}
              type="button"
              onClick={() => onSelectPrompt?.(prompt)}
              className="group flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 bg-surface-card p-3.5 text-left transition-colors hover:border-neutral-300 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.25, ease: EASE_OUT_SOFT },
                },
              }}
              whileHover={{}}
            >
              <motion.span
                className="mt-0.5 inline-flex shrink-0 text-accent-500 dark:text-accent-300"
                whileHover={{ x: 2 }}
                transition={SPRING_SNAPPY}
              >
                <Icon className="h-4 w-4" />
              </motion.span>
              <div>
                <div className="text-sm font-semibold text-fg-default">
                  {label}
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                  {description}
                </div>
              </div>
            </motion.button>
          ))}
        </motion.div>
      ) : (
        <div className="grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2">
          {prompts.map(({ label, description, prompt, Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => onSelectPrompt?.(prompt)}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 bg-surface-card p-3.5 text-left transition-colors hover:border-neutral-300 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent-500 dark:text-accent-300" />
              <div>
                <div className="text-sm font-semibold text-fg-default">
                  {label}
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                  {description}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/*
        Sprint 23g — trust metric strip. Replaces the prior "How it
        works" process strip with three short proof-points in the
        Cluely hero-metric register (Cluely uses "300ms response · 12
        languages · 95% accuracy"; we use "15+ clauses checked · Every
        flag cites NJSA · Plain-English explanations"). Sets
        credibility through specifics rather than adjectives.
      */}
      <div
        data-testid="chat-empty-trust-metrics"
        className="mt-10 flex w-full max-w-lg flex-wrap items-baseline justify-center gap-x-3 gap-y-1.5 text-[11px] text-fg-subtle"
      >
        {TRUST_METRICS.map((metric, index) => (
          <span
            key={metric.text}
            className="inline-flex items-baseline gap-3 whitespace-nowrap"
          >
            {/* Sprint 23h — Roman numeral prefix. Mono register echoes
                open-design.ai's editorial section-marker treatment;
                slightly muted so it reads as numbering, not a label. */}
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

      {/*
        Sprint 17 §5.6 — Trust block. Renders the LEASELENS_DISCLAIMER
        constant verbatim so the legal copy stays a single source of
        truth (also in the system prompt + README). Sits below the
        trust-metrics strip; disappears as soon as the user sends the
        first message (the whole empty state unmounts).
      */}
      <div
        data-testid="chat-empty-disclaimer"
        className="mt-6 inline-flex w-full max-w-lg items-start gap-2 rounded-lg border border-neutral-200 bg-surface-card p-3 text-left text-xs leading-relaxed text-fg-muted dark:border-neutral-800 dark:bg-neutral-900"
      >
        <Info
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle"
          aria-hidden="true"
          strokeWidth={2}
        />
        <span>{LEASELENS_DISCLAIMER}</span>
      </div>
    </div>
  );
}
