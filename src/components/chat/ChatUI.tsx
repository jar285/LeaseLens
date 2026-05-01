'use client';

import { AlertCircle, SquarePen } from 'lucide-react';
import { useState } from 'react';
import { parseStreamLine } from '@/lib/chat/parse-stream-line';
import { ChatComposer } from './ChatComposer';
import type { ChatMessageProps, ToolInvocation } from './ChatMessage';
import { ChatTranscript } from './ChatTranscript';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to generate response';
}

export interface ChatUIProps {
  initialMessages?: ChatMessageProps[];
  conversationId?: string | null;
}

export function ChatUI({
  initialMessages = [],
  conversationId = null,
}: ChatUIProps) {
  const [messages, setMessages] = useState<ChatMessageProps[]>(initialMessages);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);

  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversationId);

  const handleNewConversation = () => {
    setMessages([]);
    setActiveConversationId(null);
    setStatus('idle');
    setErrorMsg('');
    setQuotaRemaining(null);
  };

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || status === 'streaming') return;

    const userMessage: ChatMessageProps = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };

    const assistantMessageId = crypto.randomUUID();
    const initialAssistantMessage: ChatMessageProps = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      toolInvocations: [],
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setStatus('streaming');
    setErrorMsg('');

    // Track pending tool invocations for this response
    const pendingTools = new Map<string, ToolInvocation>();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversationId: activeConversationId,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to generate response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const data = parseStreamLine(line);
          if (!data) {
            continue;
          }

          if ('conversationId' in data) {
            setActiveConversationId(data.conversationId);
          } else if ('quota' in data) {
            setQuotaRemaining(data.quota.remaining);
          } else if ('error' in data) {
            throw new Error(data.error);
          } else if ('chunk' in data) {
            currentContent += data.chunk;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: currentContent,
                      toolInvocations: Array.from(pendingTools.values()),
                    }
                  : m,
              ),
            );
          } else if ('tool_use' in data) {
            // Add pending tool invocation
            const invocation: ToolInvocation = {
              id: data.tool_use.id,
              name: data.tool_use.name,
              input: data.tool_use.input,
            };
            pendingTools.set(data.tool_use.id, invocation);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      toolInvocations: Array.from(pendingTools.values()),
                    }
                  : m,
              ),
            );
          } else if ('tool_result' in data) {
            // Update tool invocation with result + audit metadata
            const existing = pendingTools.get(data.tool_result.id);
            if (existing) {
              existing.result = data.tool_result.result;
              existing.error = data.tool_result.error;
              existing.audit_id = data.tool_result.audit_id;
              existing.compensating_available =
                data.tool_result.compensating_available;
              pendingTools.set(data.tool_result.id, existing);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        toolInvocations: Array.from(pendingTools.values()),
                      }
                    : m,
                ),
              );
            }
          }
        }
      }

      if (buffer.trim()) {
        const trailingData = parseStreamLine(buffer);
        if (trailingData && 'error' in trailingData) {
          throw new Error(trailingData.error);
        }
      }

      setStatus('idle');
    } catch (error) {
      console.error(error);
      setErrorMsg(getErrorMessage(error));
      setStatus('error');
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="grid h-full min-h-0 w-full grid-rows-[auto_minmax(0,1fr)_auto]">
      {/* Conversation toolbar — only visible when a conversation is active */}
      <div
        data-testid="conversation-toolbar"
        className={`flex shrink-0 items-center justify-end border-b border-gray-100 px-4 py-1.5 ${
          hasMessages ? '' : 'invisible'
        }`}
      >
        <button
          type="button"
          data-testid="new-conversation-btn"
          onClick={handleNewConversation}
          disabled={status === 'streaming'}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 disabled:pointer-events-none disabled:opacity-40"
        >
          <SquarePen className="h-3.5 w-3.5" aria-hidden="true" />
          New conversation
        </button>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {status === 'streaming' && 'Assistant is typing...'}
        {status === 'error' && `Error: ${errorMsg}`}
      </div>

      <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        <ChatTranscript
          messages={messages}
          isStreaming={status === 'streaming'}
        />
      </div>

      <div className="flex flex-col">
        {quotaRemaining !== null && quotaRemaining <= 2 && (
          <div className="mx-6 mb-1 mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Demo quota: {quotaRemaining} message
            {quotaRemaining !== 1 ? 's' : ''} remaining this hour.
          </div>
        )}

        {status === 'error' && (
          <div className="mx-6 mb-2 mt-2 flex shrink-0 items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold">
                Failed to generate response
              </h3>
              <p className="mt-0.5 text-sm text-red-600/80">{errorMsg}</p>
            </div>
          </div>
        )}

        <ChatComposer
          onSubmit={handleSubmit}
          isLocked={status === 'streaming'}
        />
      </div>
    </div>
  );
}
