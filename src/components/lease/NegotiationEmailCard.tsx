'use client';

/*
 * Sprint 23f Phase 1 — NegotiationEmailCard.
 *
 * The dedicated visual surface for `draft_negotiation_email` tool
 * results in Tenant mode. Previously these results rendered as
 * collapsed JSON ToolCards (Reviewer trace view leaking into the
 * tenant chat); the tenant had to expand a card and read JSON to
 * find the email's subject and body. This component renders the
 * email as a real card: clause label + severity badge in the header,
 * subject and body verbatim with line breaks preserved, and a Copy
 * button in a sunken footer band.
 *
 * Pure presentation. Props in, JSX out. The only internal state is
 * the `copied` boolean used for transient "Copied" feedback after
 * the user clicks Copy.
 *
 * Sprint-23e.3's verbatim-render prompt instruction stays in place
 * as the screen-reader-friendly fallback and a paste-target — this
 * card is the primary surface, but the model also writes the email
 * out as markdown text below.
 */

import { Check, Copy, Mail } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { Severity } from './grading';
import { SeverityBadge } from './SeverityBadge';

const COPIED_FEEDBACK_MS = 1600;

// Sprint 23f Phase 3 — entry transition, matches the s23c.5
// UploadedLeaseCard fade-in shape so the two card surfaces feel
// consistent: 350ms duration, opacity 0 → 1, 16px y-translate, ease-
// out-soft curve. Reduced motion renders plain DOM (no animation).
const ENTRY_INITIAL = { opacity: 0, y: 16 } as const;
const ENTRY_ANIMATE = { opacity: 1, y: 0 } as const;
const ENTRY_TRANSITION = {
  duration: 0.35,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
} as const;

export interface NegotiationEmailCardProps {
  /** Human-readable label for the clause this email targets (e.g.
   *  "Security deposit · §3"). Resolved by the caller from
   *  clauseLabel() in grading.ts. */
  clauseLabel: string;
  /** Severity for the matching grading. Omit when no matching prior
   *  grading exists; the SeverityBadge is skipped in that case. */
  severity?: Severity;
  /** Email subject — verbatim from tool_result.subject. */
  subject: string;
  /** Email body — verbatim from tool_result.body. Multi-line; line
   *  breaks are preserved via whitespace-pre-line. */
  body: string;
  /** Audit reference from tool_result.email_id. Not user-visible
   *  here; reserved for future "Show audit row" affordances. */
  emailId?: string;
}

function isClipboardAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.writeText === 'function'
  );
}

/*
 * Hook: SSR-safe clipboard feature detection.
 *
 * The browser's clipboard API only exists in client environments —
 * `typeof navigator === 'undefined'` is the truth on the server.
 * Checking it directly during render produced a hydration mismatch
 * (server emitted `disabled=""` on the Copy button; client rendered
 * `disabled={false}`). To match SSR and the first client paint, we
 * always start as "supported" and only adjust on mount. In the rare
 * case where the API is genuinely missing (insecure context, very
 * old browser), the button transitions to disabled after hydration —
 * before any user interaction can hit a missing API.
 */
function useClipboardSupported(): boolean {
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(isClipboardAvailable());
  }, []);
  return supported;
}

export function NegotiationEmailCard({
  clauseLabel,
  severity,
  subject,
  body,
  emailId,
}: NegotiationEmailCardProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const clipboardAvailable = useClipboardSupported();
  const reduced = useReducedMotion();

  // Clear the transient feedback after a short window. The effect
  // re-arms on every Copy click via the `copied` dependency.
  useEffect(() => {
    if (!copied) return;
    const handle = window.setTimeout(() => {
      setCopied(false);
    }, COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(handle);
  }, [copied]);

  function handleCopy(): void {
    if (!clipboardAvailable) return;
    // Fire-and-forget the clipboard write; flip the UI state
    // synchronously so the feedback is immediate. This is the
    // standard browser pattern — the user gesture authorises the
    // write, so a permission denial here is rare enough to ignore.
    setCopied(true);
    void navigator.clipboard.writeText(body);
  }

  const cardClassName =
    'my-3 overflow-hidden rounded-xl border border-neutral-200 bg-surface-elevated shadow-hairline dark:border-neutral-800';

  const cardInner = (
    <>
      {/* Header — clause label + severity badge */}
      <header className="flex items-center gap-2.5 border-b border-neutral-100 px-5 py-3 dark:border-neutral-800">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300"
        >
          <Mail className="h-3.5 w-3.5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
            Email
          </p>
          <p className="truncate text-[13px] font-medium text-fg-default">
            {clauseLabel}
          </p>
        </div>
        {severity ? <SeverityBadge severity={severity} size="sm" /> : null}
      </header>

      {/* Subject + body */}
      <div className="px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
          Subject
        </p>
        <p className="mt-0.5 font-mono text-[13px] font-medium text-fg-default">
          {subject}
        </p>
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
          Body
        </p>
        <div
          data-testid="negotiation-email-card-body"
          className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-fg-default"
        >
          {body}
        </div>
      </div>

      {/* Footer — Copy button on a sunken band */}
      <div className="flex items-center justify-end gap-2 border-t border-neutral-100 bg-surface-sunken px-5 py-2.5 dark:border-neutral-800">
        <button
          type="button"
          data-state={copied ? 'copied' : 'idle'}
          aria-label={copied ? 'Copied' : 'Copy email body'}
          onClick={handleCopy}
          disabled={!clipboardAvailable}
          className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-neutral-200 bg-surface-card px-3 text-[12px] font-medium text-fg-default transition-colors hover:border-accent-300 hover:bg-accent-50/40 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-accent-400/40 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
        >
          {copied ? (
            <Check
              className="h-3.5 w-3.5 text-success-600 dark:text-success-100"
              aria-hidden="true"
              strokeWidth={2.5}
            />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
          )}
          {copied ? 'Copied' : 'Copy email'}
        </button>
      </div>
    </>
  );

  if (reduced) {
    return (
      <div
        data-testid="negotiation-email-card"
        data-email-id={emailId}
        data-motion="off"
        className={cardClassName}
      >
        {cardInner}
      </div>
    );
  }

  return (
    <motion.div
      data-testid="negotiation-email-card"
      data-email-id={emailId}
      data-motion="on"
      className={cardClassName}
      initial={ENTRY_INITIAL}
      animate={ENTRY_ANIMATE}
      transition={ENTRY_TRANSITION}
    >
      {cardInner}
    </motion.div>
  );
}
