import { ArrowUp } from 'lucide-react';
import { type ChangeEvent, type KeyboardEvent, useRef, useState } from 'react';

export interface ChatComposerProps {
  onSubmit: (text: string) => void;
  isLocked: boolean;
}

const MIN_TEXTAREA_HEIGHT = 38;
const MAX_TEXTAREA_HEIGHT = 192;

export function ChatComposer({ onSubmit, isLocked }: ChatComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div className="border-t border-gray-100 bg-white px-6 pb-4 pt-3.5">
      <div className="relative mx-auto flex max-w-2xl items-end gap-2.5 rounded-xl border border-gray-200 bg-white p-2 transition-all focus-within:border-indigo-300 focus-within:ring-2 focus-within:ring-indigo-100">
        <label htmlFor="chat-composer-input" className="sr-only">
          Type a message
        </label>
        <textarea
          ref={textareaRef}
          id="chat-composer-input"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isLocked}
          placeholder="Ask about brand voice, content pillars, or the first-week calendar…"
          className="min-h-[38px] flex-1 resize-none border-0 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-0"
          rows={1}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLocked || !text.trim()}
          aria-label="Send message"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2 disabled:opacity-35 disabled:hover:bg-indigo-600"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" strokeWidth={2.5} />
        </button>
      </div>
      <div className="mt-2 text-center font-mono text-[10px] tracking-wide text-gray-300">
        shift + enter for new line
      </div>
    </div>
  );
}
