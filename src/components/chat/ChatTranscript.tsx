import { useEffect, useRef } from 'react';
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
      className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-6 md:px-8"
    >
      <div className="mx-auto w-full max-w-3xl shrink-0">
        <ul className="m-0 list-none space-y-1 p-0 pb-4">
          {messages.map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              {...msg}
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
