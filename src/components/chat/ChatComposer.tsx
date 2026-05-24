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
import { SPRING_SNAPPY } from '@/lib/motion/presets';

export interface ChatComposerProps {
  onSubmit: (text: string) => void;
  isLocked: boolean;
  /**
   * Sprint 26c — optional seed value for the textarea. Used by the
   * assistant FAB to pre-fill prompts like "Explain clause §3" when
   * the user clicks Explain on a red-flag card or clause row. The
   * composer keeps its own controlled state internally; this only
   * seeds the initial value on mount (and re-syncs when the prop
   * value changes between non-empty strings, so back-to-back
   * Explain clicks pick up the new prefill).
   */
  initialText?: string;
}

// Sprint 23c Phase 3 — bumped from 38 to 44 to clear the touch-target
// floor for mobile + give the command bar more visual weight as a real
// command surface (not just a chat input).
const MIN_TEXTAREA_HEIGHT = 44;
const MAX_TEXTAREA_HEIGHT = 192;

export function ChatComposer({
  onSubmit,
  isLocked,
  initialText,
}: ChatComposerProps) {
  const [text, setText] = useState(initialText ?? '');
  const lastPrefillRef = useRef<string | undefined>(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const animate = mounted && !reduced;

  // Sprint 26c — re-seed when the parent passes a NEW non-empty
  // prefill string. We only react to value changes (not just truthy
  // values) so a stable parent re-render with the same prefill never
  // clobbers what the user has typed. Setting the textarea height is
  // deferred to the existing handleChange resize path: the next user
  // keystroke or a manual change event will recalculate.
  useEffect(() => {
    if (initialText && initialText !== lastPrefillRef.current) {
      setText(initialText);
      lastPrefillRef.current = initialText;
    }
  }, [initialText]);

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

  // Sprint 15 Phase 4 — focus-within crossfade. Tailwind transitions on
  // the wrapper handle the crossfade between neutral-200 (idle) and
  // accent-400 (focus). Ring is also accent-tinted.
  // Sprint 23g — explicit `transition-[border-color,box-shadow]` so the
  // focus ring (Tailwind ring-* is implemented as box-shadow) animates
  // smoothly alongside the border-colour change. `transition-colors` was
  // missing box-shadow, so the ring snapped on/off while the border
  // crossfaded — the source of the "not quite smooth" focus feel.
  return (
    <div className="border-t border-neutral-100 bg-surface-card px-6 pb-4 pt-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="relative mx-auto flex max-w-2xl items-end gap-2.5 rounded-xl border border-neutral-200 bg-surface-card p-2 transition-[border-color,box-shadow] duration-150 ease-out-soft focus-within:border-accent-400 focus-within:ring-2 focus-within:ring-accent-100 dark:border-neutral-800 dark:bg-neutral-900 dark:focus-within:border-accent-500 dark:focus-within:ring-accent-500/15">
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
          // Sprint 23c Phase 3 — refreshed placeholder positions the
          // composer as a command bar; the "/ for actions" cue paired
          // with the kbd hint below signals slash-commands without
          // wiring the picker (that lands later).
          placeholder="Ask about a clause, request a rewrite, or type / for actions…"
          aria-describedby="composer-hint"
          // Sprint 17 §5.4 — `inputMode="text"` so mobile keyboards
          // show the standard text layout (no numeric/decimal hint
          // bleed-through from autodetection). `autoCapitalize` +
          // `spellCheck` defaults are appropriate for natural-language
          // questions; setting them explicitly documents intent.
          inputMode="text"
          autoCapitalize="sentences"
          spellCheck
          className="min-h-11 flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm text-fg-default outline-none placeholder:text-fg-subtle focus:ring-0"
          rows={1}
        />
        {/* Sprint 23c Phase 3 — visual slash-command hint kbd. Visible at
            idle (empty textarea), softly hidden when the user starts
            typing. Pure affordance — no slash-command picker behavior. */}
        <kbd
          data-testid="composer-slash-hint"
          className={`pointer-events-none mb-1 hidden h-6 items-center justify-center self-end rounded border border-neutral-200 bg-surface-muted px-1.5 font-mono text-[10px] font-medium text-fg-muted transition-opacity duration-150 sm:inline-flex dark:border-neutral-700 dark:bg-neutral-800 ${
            text.length > 0 ? 'opacity-0' : 'opacity-100'
          }`}
        >
          /
        </kbd>
        {animate ? (
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={sendDisabled}
            aria-label="Send message"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-600 text-white shadow-sm transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 disabled:opacity-35 disabled:hover:bg-accent-600"
            whileHover={sendDisabled ? undefined : { scale: 1.05 }}
            whileTap={sendDisabled ? undefined : { scale: 0.97 }}
            transition={SPRING_SNAPPY}
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
