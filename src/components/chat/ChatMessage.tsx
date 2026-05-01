import { PenTool, User } from 'lucide-react';
import { renderMarkdown } from '@/lib/chat/render-markdown';
import { ToolCard } from './ToolCard';

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
}

export function ChatMessage({
  role,
  content,
  toolInvocations,
}: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <li
      className={`flex gap-3.5 py-4 ${isUser ? '' : 'rounded-xl bg-gray-50 px-4'}`}
    >
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
        {/* Message content */}
        {content && (
          <div className="wrap-break-word text-[14.5px] leading-[1.7] text-gray-600">
            {isUser ? content : renderMarkdown(content)}
          </div>
        )}
      </div>
    </li>
  );
}
