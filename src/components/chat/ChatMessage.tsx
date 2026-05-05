'use client';

import { PenTool, User } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
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
  /** Sprint 9: true only for the actively-streaming assistant message
   *  (set by ChatTranscript on the last message). Drives the in-bubble
   *  TypingIndicator visibility under the four-clause condition. */
  isStreaming?: boolean;
}

export function ChatMessage({
  role,
  content,
  toolInvocations,
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

  const className = `flex gap-3.5 py-4 ${isUser ? '' : 'rounded-xl bg-gray-50 px-4'}`;

  const inner = (
    <>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isUser
            ? 'border border-gray-200 bg-white text-gray-400'
            : 'bg-indigo-600 text-white'
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
        ) : (
          <PenTool className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2} />
        )}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="mb-0.5 text-[13px] font-semibold text-gray-800">
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
        {/* Message content — or TypingIndicator under the four-clause
            condition (Spec §4.9). The indicator shows only for an empty
            assistant bubble that is actively streaming AND has no tool
            invocations underway (a ToolCard is the activity signal during
            tool use; we don't want both). */}
        {showTypingIndicator ? (
          <TypingIndicator />
        ) : (
          content && (
            <div className="wrap-break-word text-[14.5px] leading-[1.7] text-gray-600">
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
