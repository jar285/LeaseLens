import { useEffect, useRef } from 'react';
import { FOLLOW_UP_PROMPTS } from '@/lib/chat/follow-up-prompts';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessage, type ChatMessageProps } from './ChatMessage';

export interface ChatTranscriptProps {
  messages: ChatMessageProps[];
  isStreaming?: boolean;
  onSelectPrompt?: (prompt: string) => void;
  workspaceName: string;
}

export function ChatTranscript({
  messages,
  isStreaming = false,
  onSelectPrompt,
  workspaceName,
}: ChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  const previousMessageCount = useRef(messages.length);

  // Track user scroll intent: if user scrolls up, unpin; if at bottom, re-pin
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 40;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    pinnedToBottom.current = atBottom;
  };

  // Adapted from docs/_references/ai_mcp_chat_ordo/src/hooks/useChatScroll.ts.
  useEffect(() => {
    // The empty-state branch renders the welcome hero (Sparkle + H1 +
    // starter cards) which is anchored to the top of the pane. Running
    // the pin-to-bottom logic against it scrolls the hero off-screen on
    // mount when the welcome content is taller than the available pane,
    // making the page look "auto-scrolled" the moment it loads.
    if (messages.length === 0) {
      previousMessageCount.current = 0;
      // React reuses the same scroll container across the empty/messages
      // branches (both top-level <div> at the same position). When the
      // previous render was a long transcript scrolled to the bottom,
      // the browser clamps the old scrollTop to the new (smaller) max
      // and the empty-state hero ends up scrolled off the top. Reset
      // to the top explicitly so the welcome state always lands above
      // the fold.
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      return;
    }

    const messageCountChanged =
      messages.length !== previousMessageCount.current;
    previousMessageCount.current = messages.length;

    if (messageCountChanged) {
      pinnedToBottom.current = true;
    }

    const el = scrollRef.current;
    if (!pinnedToBottom.current || !el) return;

    el.scrollTo({
      top: el.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div
        ref={scrollRef}
        data-testid="chat-transcript-scroll"
        className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
      >
        <ChatEmptyState
          onSelectPrompt={onSelectPrompt}
          workspaceName={workspaceName}
        />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      data-testid="chat-transcript-scroll"
      onScroll={handleScroll}
      className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-5 md:px-8"
    >
      <div className="mx-auto w-full max-w-3xl shrink-0">
        <ul className="m-0 list-none space-y-1 p-0 pb-4">
          {messages.map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              {...msg}
              onSelectPrompt={onSelectPrompt}
              followUpPrompts={
                !isStreaming &&
                idx === messages.length - 1 &&
                msg.role === 'assistant'
                  ? FOLLOW_UP_PROMPTS
                  : undefined
              }
              isStreaming={
                isStreaming &&
                idx === messages.length - 1 &&
                msg.role === 'assistant'
              }
            />
          ))}
          <div data-testid="transcript-bottom" className="h-1" />
        </ul>
      </div>
    </div>
  );
}
