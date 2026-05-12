'use client';

import { ArrowUp } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AttachButton } from './AttachButton';

export interface ChatComposerProps {
  onSubmit: (text: string) => void;
  isLocked: boolean;
  /**
   * Sprint 11 (revised) — when provided, renders the paperclip attach
   * button left of the send button. Receives the selected .md files
   * (already filtered + capped to 5) so the parent can open the brand
   * upload modal.
   */
  onAttachFiles?: (files: File[]) => void;
}

const MIN_TEXTAREA_HEIGHT = 38;
const MAX_TEXTAREA_HEIGHT = 192;

export function ChatComposer({
  onSubmit,
  isLocked,
  onAttachFiles,
}: ChatComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const animate = mounted && !reduced;

  const handleSubmit = () => {
    if (isLocked) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    onSubmit(trimmed);
    setText('');

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${MIN_TEXTAREA_HEIGHT}px`;
      textarea.style.overflowY = 'hidden';
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    setText(e.target.value);

    // Adapted from docs/_references/ai_mcp_chat_ordo/src/frameworks/ui/ChatInput.tsx.
    textarea.style.height = '0px';
    const nextHeight = Math.max(
      Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT),
      MIN_TEXTAREA_HEIGHT,
    );
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const sendDisabled = isLocked || !text.trim();

  // Sprint 15 Phase 4 — focus-within crossfade. Tailwind transition-colors
  // on the wrapper handles the 120ms crossfade between neutral-200 (idle)
  // and accent-400 (focus). Ring is also accent-tinted.
  return (
    <div className="border-t border-neutral-100 bg-surface-card px-6 pb-4 pt-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="relative mx-auto flex max-w-2xl items-end gap-2.5 rounded-xl border border-neutral-200 bg-surface-card p-2 transition-colors duration-120 ease-out-soft focus-within:border-accent-400 focus-within:ring-2 focus-within:ring-accent-100 dark:border-neutral-800 dark:bg-neutral-900 dark:focus-within:border-accent-500 dark:focus-within:ring-accent-500/15">
        <label htmlFor="chat-composer-input" className="sr-only">
          Type a message
        </label>
        <span id="composer-hint" className="sr-only">
          Press Shift plus Enter to insert a new line.
        </span>
        <textarea
          ref={textareaRef}
          id="chat-composer-input"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isLocked}
          placeholder="Ask about a lease clause, NJ tenant law, or upload a lease to start a scan…"
          aria-describedby="composer-hint"
          // Sprint 17 §5.4 — `inputMode="text"` so mobile keyboards
          // show the standard text layout (no numeric/decimal hint
          // bleed-through from autodetection). `autoCapitalize` +
          // `spellCheck` defaults are appropriate for natural-language
          // questions; setting them explicitly documents intent.
          inputMode="text"
          autoCapitalize="sentences"
          spellCheck
          className="min-h-[38px] flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm text-fg-default outline-none placeholder:text-fg-subtle focus:ring-0"
          rows={1}
        />
        {onAttachFiles && (
          <AttachButton onFiles={onAttachFiles} disabled={isLocked} />
        )}
        {animate ? (
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={sendDisabled}
            aria-label="Send message"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-white shadow-sm transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 disabled:opacity-35 disabled:hover:bg-accent-600"
            whileHover={sendDisabled ? undefined : { scale: 1.05 }}
            whileTap={sendDisabled ? undefined : { scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
          </motion.button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={sendDisabled}
            aria-label="Send message"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-white shadow-sm transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 disabled:opacity-35 disabled:hover:bg-accent-600"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
          </button>
        )}
      </div>
      <div className="mt-2 text-center font-mono text-[10px] tracking-wide text-fg-subtle">
        shift + enter for new line
      </div>
    </div>
  );
}
