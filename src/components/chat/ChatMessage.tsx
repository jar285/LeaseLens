'use client';

import { PenTool, User } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { FollowUpPrompt } from '@/lib/chat/follow-up-prompts';
import { renderMarkdown } from '@/lib/chat/render-markdown';
import { ToolCard } from './ToolCard';
import { TypingIndicator } from './TypingIndicator';

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
}

export function ChatMessage({
  role,
  content,
  toolInvocations,
  followUpPrompts,
  onSelectPrompt,
  isStreaming,
}: ChatMessageProps) {
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

  // Sprint 15 Phase 5 — assistant bubble uses the muted surface token so it
  // reads as a quiet card on both light and dark schemes.
  const className = `flex gap-3.5 py-4 ${isUser ? '' : 'rounded-xl bg-surface-muted px-4 dark:bg-neutral-800/50'}`;

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
        {/* Tool invocations */}
        {toolInvocations && toolInvocations.length > 0 && (
          <div className="my-2">
            {toolInvocations.map((invocation) => (
              <ToolCard key={invocation.id} invocation={invocation} />
            ))}
          </div>
        )}
        {followUpPrompts && followUpPrompts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {followUpPrompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                onClick={() => onSelectPrompt?.(prompt.prompt)}
                className="rounded-full border border-accent-200 bg-surface-card px-3 py-1.5 text-xs font-medium text-accent-700 transition-colors hover:border-accent-300 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-accent-500/30 dark:bg-neutral-900 dark:text-accent-300 dark:hover:border-accent-400/50 dark:hover:bg-accent-500/10"
              >
                {prompt.label}
              </button>
            ))}
          </div>
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
