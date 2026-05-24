'use client';

import { AlertTriangle, PenTool, User } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import {
  CLAUSE_TYPE_LABEL,
  clauseLabel,
  type GradingResult,
  isGradingResult,
  type Severity,
} from '@/components/lease/grading';
import { NegotiationEmailCard } from '@/components/lease/NegotiationEmailCard';
import { ScanTimeline } from '@/components/lease/ScanTimeline';
import type { Role } from '@/lib/auth/types';
import type { FollowUpPrompt } from '@/lib/chat/follow-up-prompts';
import { renderMarkdown } from '@/lib/chat/render-markdown';
import { useChatStream } from './ChatStreamContext';
import { ToolCard } from './ToolCard';
import { TypingIndicator } from './TypingIndicator';

/*
 * Sprint 18 §5 — names of the tool calls that make up a scan turn. When
 * the viewer is a Tenant AND a message's invocations include any of
 * these, ChatMessage renders the conversational <ScanTimeline /> instead
 * of the inline tool-card stack. Other tool calls (e.g. search_corpus,
 * render_workflow_diagram, draft_negotiation_email) keep rendering as
 * tool cards in every role — they're either neutral (search) or
 * meaningful as a visible action card to the tenant (a drafted email
 * SHOULD be visible inline; that's the user's deliverable).
 */
const SCAN_TOOL_NAMES = new Set(['extract_clauses', 'grade_clause_severity']);

export interface ToolInvocation {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  /** Sprint 8: audit_log row id for mutating-tool results — drives Undo button. */
  audit_id?: string;
  /** Sprint 8: true when descriptor.compensatingAction was registered. */
  compensating_available?: boolean;
}

export interface ChatMessageProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolInvocations?: ToolInvocation[];
  followUpPrompts?: FollowUpPrompt[];
  onSelectPrompt?: (prompt: string) => void;
  /** Sprint 9: true only for the actively-streaming assistant message
   *  (set by ChatTranscript on the last message). Drives the in-bubble
   *  TypingIndicator visibility under the four-clause condition. */
  isStreaming?: boolean;
  /** Sprint 18 — set when the server received `stop_reason: "max_tokens"`
   *  from Anthropic on this message. Renders an inline "response was
   *  cut short" notice under the bubble so the user understands the
   *  text intentionally stops mid-thought. */
  truncated?: boolean;
  truncatedReason?: 'max_tokens';
}

export function ChatMessage({
  role,
  content,
  toolInvocations,
  followUpPrompts,
  onSelectPrompt,
  isStreaming,
  truncated,
}: ChatMessageProps) {
  const { viewerRole } = useChatStream();
  const isUser = role === 'user';
  const showTypingIndicator =
    isStreaming === true &&
    role === 'assistant' &&
    !content &&
    (toolInvocations === undefined || toolInvocations.length === 0);

  // Mounted-state guard: SSR + first client paint render the plain
  // <li>. The motion variant appears on the second paint to prevent
  // a reduced-motion flash.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = useReducedMotion();
  const animate = mounted && !reduced && role === 'assistant';

  // Sprint 27.1 — both user and assistant messages wear a card so the
  // transcript reads as discrete bubbles (Wathan/Schoger: visual
  // hierarchy via consistent component shape). User bubble carries
  // a hairline border + surface-card background; assistant bubble
  // keeps the muted-surface fill. The shape (rounded + padded) is
  // shared so the inter-message gap reads as deliberate spacing
  // rather than the bottom edge of an unstyled paragraph touching
  // the top of an assistant card.
  const className = `flex gap-3.5 rounded-xl px-4 py-4 ${
    isUser
      ? 'border border-neutral-100 bg-surface-card dark:border-neutral-800 dark:bg-neutral-900'
      : 'bg-surface-muted dark:bg-neutral-800/50'
  }`;

  // The brief asks for a per-token fade on streamed assistant tokens. A
  // robust implementation conflicts with the markdown renderer (every
  // chunk re-renders the full tree). Sprint 15 ships the token swap and
  // dark-mode coverage; per-token fade is filed as a Sprint 16 follow-up.
  const inner = (
    <>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isUser
            ? 'border border-neutral-200 bg-surface-card text-fg-subtle dark:border-neutral-700 dark:bg-neutral-900'
            : 'bg-accent-600 text-white'
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
        ) : (
          <PenTool className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
        )}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-0.5 text-[13px] font-semibold text-fg-default">
          {isUser ? 'You' : 'Editorial Assistant'}
        </div>
        {/*
          Tool invocations.

          Sprint 18 §5 — Tenant viewers see a conversational
          <ScanTimeline /> instead of the linear tool-card stack
          whenever the message includes a scan tool call. Reviewer
          and Admin keep the existing inline cards — they're auditors,
          the trace IS the value. Non-scan tool calls (search_corpus,
          draft_negotiation_email, etc.) render as cards in every role.
        */}
        {toolInvocations && toolInvocations.length > 0 && (
          <ToolInvocationsBlock
            viewerRole={viewerRole}
            invocations={toolInvocations}
          />
        )}
        {/* Message content — or TypingIndicator under the four-clause
            condition (Spec §4.9). The indicator shows only for an empty
            assistant bubble that is actively streaming AND has no tool
            invocations underway (a ToolCard is the activity signal during
            tool use; we don't want both). */}
        {showTypingIndicator ? (
          <TypingIndicator />
        ) : (
          content && (
            <div className="wrap-break-word text-[14.5px] leading-[1.7] text-fg-default/85">
              {isUser ? content : renderMarkdown(content)}
            </div>
          )
        )}
        {/* Sprint 27.1 — follow-up chips moved here (was above the
            body). Chips suggest the *next* question, so the user
            should read the answer first and then see the chips.
            Don Norman: matches the expected read order. */}
        {followUpPrompts && followUpPrompts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {followUpPrompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                onClick={() => onSelectPrompt?.(prompt.prompt)}
                // S19.9 — `min-h-11` enforces the 44px touch-target
                // floor on mobile without bloating the visible chip
                // on desktop (centre alignment keeps the label nested
                // visually inside the same hairline border).
                className="inline-flex min-h-11 items-center rounded-full border border-accent-200 bg-surface-card px-3 py-1.5 text-xs font-medium text-accent-700 transition-colors hover:border-accent-300 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-accent-500/30 dark:bg-neutral-900 dark:text-accent-300 dark:hover:border-accent-400/50 dark:hover:bg-accent-500/10"
              >
                {prompt.label}
              </button>
            ))}
          </div>
        )}
        {/* Sprint 18 — truncation notice. Renders only when the server
            saw `stop_reason: "max_tokens"` on this assistant message.
            Sits below the body so the user reads the (possibly mid-
            thought) text first, then learns it was cut short. */}
        {truncated && role === 'assistant' && (
          <div
            data-testid="message-truncated-notice"
            role="status"
            className="mt-3 flex items-start gap-2 rounded-md border border-warning-100 bg-warning-100/60 px-3 py-2 text-[12px] leading-snug text-warning-600 dark:border-warning-600/30 dark:bg-warning-600/10 dark:text-warning-100"
          >
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
              strokeWidth={2}
            />
            <span>
              Response was cut short — the model reached its output limit before
              finishing. Ask me to continue, or to summarise the remaining
              clauses, to see the rest.
            </span>
          </div>
        )}
      </div>
    </>
  );

  return animate ? (
    <motion.li
      data-motion="on"
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {inner}
    </motion.li>
  ) : (
    <li data-motion="off" className={className}>
      {inner}
    </li>
  );
}

/*
 * Sprint 18 §5 + Sprint 23f §2 — role-aware tool-invocation render.
 *
 * Four render paths share this block:
 *  1. Tenant + scan invocations → <ScanTimeline />.
 *  2. Tenant + draft_negotiation_email invocations → <NegotiationEmailCard />
 *     (Sprint 23f). The card resolves clause label + severity from prior
 *     grade_clause_severity tool_results in the event stream.
 *  3. Tenant + other non-scan invocations → inline ToolCard stack.
 *  4. Reviewer / Admin (any invocations) → inline ToolCard stack unchanged.
 *     They're auditors; trace fidelity is the value.
 */

const DRAFT_EMAIL_TOOL = 'draft_negotiation_email';

interface DraftEmailResult {
  email_id?: string;
  clause_id?: string;
  subject?: string;
  body?: string;
  tone?: string;
}

interface DraftEmailInvocationInput {
  clause_id?: unknown;
}

/**
 * Sprint 23f §2 — resolve clause label + severity for a
 * draft_negotiation_email invocation by scanning the tool-event stream
 * for the most-recent matching grade_clause_severity result. Falls
 * back gracefully when no matching grading is in scope.
 */
function resolveClauseContext(
  invocation: ToolInvocation,
  toolEvents: readonly ToolEvent[],
): { clauseLabel: string; severity: Severity | undefined } {
  const clauseId =
    typeof (invocation.input as DraftEmailInvocationInput)?.clause_id ===
    'string'
      ? ((invocation.input as DraftEmailInvocationInput).clause_id as string)
      : (invocation.result as DraftEmailResult | undefined)?.clause_id;
  if (!clauseId) {
    return { clauseLabel: 'Clause', severity: undefined };
  }
  // Walk events in reverse — latest grading wins (handles re-runs).
  for (let i = toolEvents.length - 1; i >= 0; i--) {
    const event = toolEvents[i];
    if (event.tool_name !== 'grade_clause_severity') continue;
    if (!isGradingResult(event.result)) continue;
    if (event.result.clause_id !== clauseId) continue;
    return {
      clauseLabel: clauseLabel(event.result as GradingResult),
      severity: event.result.severity,
    };
  }
  // Fallback — no matching grading in the stream.
  return {
    clauseLabel: CLAUSE_TYPE_LABEL.unknown ?? 'Clause',
    severity: undefined,
  };
}

function ToolInvocationsBlock({
  viewerRole,
  invocations,
}: {
  viewerRole: Role;
  invocations: ToolInvocation[];
}): React.JSX.Element {
  const { toolEvents } = useChatStream();
  const scanInvocations = invocations.filter((inv) =>
    SCAN_TOOL_NAMES.has(inv.name),
  );
  const nonScanInvocations = invocations.filter(
    (inv) => !SCAN_TOOL_NAMES.has(inv.name),
  );
  const showTimeline = viewerRole === 'Tenant' && scanInvocations.length > 0;
  const isTenant = viewerRole === 'Tenant';

  return (
    <div className="my-2">
      {showTimeline ? (
        <ScanTimeline invocations={scanInvocations} />
      ) : (
        scanInvocations.map((invocation) => (
          <ToolCard key={invocation.id} invocation={invocation} />
        ))
      )}
      {nonScanInvocations.map((invocation) => {
        // Sprint 23f — Tenant + draft_negotiation_email routes to the
        // dedicated NegotiationEmailCard surface. Reviewer/Admin keeps
        // the raw ToolCard for trace fidelity.
        if (isTenant && invocation.name === DRAFT_EMAIL_TOOL) {
          const result = invocation.result as DraftEmailResult | undefined;
          const { clauseLabel: label, severity } = resolveClauseContext(
            invocation,
            toolEvents,
          );
          return (
            <NegotiationEmailCard
              key={invocation.id}
              clauseLabel={label}
              severity={severity}
              subject={result?.subject ?? ''}
              body={result?.body ?? ''}
              emailId={result?.email_id}
            />
          );
        }
        return <ToolCard key={invocation.id} invocation={invocation} />;
      })}
    </div>
  );
}
