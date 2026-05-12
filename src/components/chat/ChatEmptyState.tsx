'use client';

import {
  AlertTriangle,
  FileSearch,
  FileText,
  Flag,
  Info,
  Mail,
  MessageSquare,
  ScrollText,
  Upload,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { LeaseLensMark } from '@/components/brand/LeaseLensMark';
import { LEASELENS_DISCLAIMER } from '@/lib/lease/disclaimer';

interface SuggestedPrompt {
  label: string;
  description: string;
  prompt: string;
  Icon: typeof FileText;
}

// Sprint 13 §3f — LeaseLens empty-state prompts. Replace the
// ContentOps-era brand-onboarding cards with lease-review starters.
// The first card is the headline scan flow; the others are common
// follow-up questions a tenant or reviewer would ask.
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

// Sprint 17 §5.3 — "How it works" strip. Four steps in a row with subtle
// separators. Each step is icon + label; no descriptions to keep the
// strip compact. Sits below the starter cards and above the disclaimer.
const HOW_IT_WORKS_STEPS = [
  { label: 'Upload lease', Icon: Upload },
  { label: 'Scan clauses', Icon: FileSearch },
  { label: 'Review red flags', Icon: Flag },
  { label: 'Ask follow-ups', Icon: MessageSquare },
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
      // the Sparkle hero + H1 ended up at a negative y inside the scroll
      // wrapper, so neither the auto-scroll-to-bottom nor an upward wheel
      // could bring them back. The safe variant pins the top to 0 when
      // overflowing and centres only when there's room.
      className="flex min-h-[60vh] w-full flex-1 flex-col items-center justify-center-safe px-6 py-12 text-center"
      data-testid="chat-empty-state"
    >
      {/*
        Sprint 17.2 — welcome hero now carries the real brand mark
        instead of lucide's generic Sparkles. The outer badge keeps its
        4-second "breathing" pulse (calm "AI is alive" cue); the mark
        inside scans once on its own mount and then rests. The two
        animations stack: continuous gentle pulse on the surface +
        one-shot scan inside.
      */}
      {animate ? (
        <motion.div
          aria-hidden="true"
          className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-500 dark:bg-accent-500/15 dark:text-accent-300"
          animate={{ scale: [1, 1.04, 1], opacity: [0.9, 1, 0.9] }}
          transition={{
            duration: 4,
            ease: 'easeInOut',
            repeat: Infinity,
          }}
        >
          <LeaseLensMark size={28} />
        </motion.div>
      ) : (
        <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-50 text-accent-500 dark:bg-accent-500/15 dark:text-accent-300">
          <LeaseLensMark size={28} animated={false} />
        </div>
      )}

      <h2 className="mb-2 font-serif text-3xl font-semibold tracking-tight text-fg-default sm:text-4xl">
        {workspaceName}
      </h2>

      <p className="mb-10 max-w-md text-[15px] leading-relaxed text-fg-muted">
        Drop a NJ residential lease in the left pane, then ask me to scan it.
        I'll extract clauses, grade each against NJ tenant-law sources, and
        draft negotiation emails for any red flags.
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
              className="group flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 bg-surface-card p-4 text-left transition-colors hover:border-neutral-300 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
              variants={{
                hidden: { opacity: 0, y: 8 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
                },
              }}
              whileHover={{}}
            >
              <motion.span
                className="mt-0.5 inline-flex shrink-0 text-accent-500 dark:text-accent-300"
                whileHover={{ x: 2 }}
                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
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
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-200 bg-surface-card p-4 text-left transition-colors hover:border-neutral-300 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
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
        Sprint 17 §5.3 — "How it works" strip. Inline four-step
        progression below the starter cards. Subtle, low-emphasis,
        gives a first-time visitor the mental model in one glance
        without competing with the cards for attention.
      */}
      <div
        data-testid="chat-empty-how-it-works"
        className="mt-10 flex w-full max-w-lg flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-[11px] text-fg-subtle"
      >
        {HOW_IT_WORKS_STEPS.map(({ label, Icon }, index) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Icon
              className="h-3 w-3 text-accent-500 dark:text-accent-300"
              aria-hidden="true"
              strokeWidth={2}
            />
            <span>{label}</span>
            {index < HOW_IT_WORKS_STEPS.length - 1 ? (
              <span aria-hidden="true" className="ml-2 text-fg-subtle/50">
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
        how-it-works strip; disappears as soon as the user sends the
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
