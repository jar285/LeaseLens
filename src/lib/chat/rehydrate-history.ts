import type {
  ChatMessageProps,
  ToolInvocation,
} from '@/components/chat/ChatMessage';

type ConversationRow = {
  id: string;
  role: string;
  content: string;
};

type PersistedToolUse = {
  tool_use: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
};

type PersistedToolResult = {
  tool_result: {
    id: string;
    name?: string;
    result: unknown;
    error?: string;
    audit_id?: string;
    compensating_available?: boolean;
  };
};

function parsePersistedToolContent(
  content: string,
): PersistedToolUse | PersistedToolResult | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'tool_use' in parsed &&
      typeof (parsed as { tool_use?: unknown }).tool_use === 'object' &&
      (parsed as { tool_use?: unknown }).tool_use !== null
    ) {
      return parsed as PersistedToolUse;
    }

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'tool_result' in parsed &&
      typeof (parsed as { tool_result?: unknown }).tool_result === 'object' &&
      (parsed as { tool_result?: unknown }).tool_result !== null
    ) {
      return parsed as PersistedToolResult;
    }
  } catch {
    return null;
  }

  return null;
}

function toToolInvocation(
  toolUse: PersistedToolUse['tool_use'],
): ToolInvocation {
  return {
    id: toolUse.id,
    name: toolUse.name,
    input: toolUse.input,
  };
}

function isLikelyErrorPayload(result: unknown): result is { error: string } {
  return (
    typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    typeof (result as { error?: unknown }).error === 'string'
  );
}

/**
 * Rehydrates persisted message rows into the shape the chat transcript expects.
 * Tool use/result rows are folded into assistant toolInvocations so reloads
 * render tool cards instead of raw JSON text.
 */
export function rehydrateConversationMessages(
  rows: ConversationRow[],
): ChatMessageProps[] {
  const messages: ChatMessageProps[] = [];
  let currentAssistant: ChatMessageProps | null = null;

  function flushAssistant() {
    if (currentAssistant) {
      messages.push(currentAssistant);
      currentAssistant = null;
    }
  }

  function ensureAssistant(): ChatMessageProps {
    if (!currentAssistant) {
      currentAssistant = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        toolInvocations: [],
      };
    }
    if (!currentAssistant.toolInvocations) {
      currentAssistant.toolInvocations = [];
    }
    return currentAssistant;
  }

  for (const row of rows) {
    if (row.role === 'user') {
      flushAssistant();
      messages.push({
        id: row.id,
        role: 'user',
        content: row.content,
      });
      continue;
    }

    if (row.role === 'assistant') {
      const parsed = parsePersistedToolContent(row.content);
      if (parsed && 'tool_use' in parsed) {
        const assistant = ensureAssistant();
        const toolInvocations = assistant.toolInvocations ?? [];
        toolInvocations.push(toToolInvocation(parsed.tool_use));
        assistant.toolInvocations = toolInvocations;
        continue;
      }

      const assistant = ensureAssistant();
      assistant.content = assistant.content
        ? `${assistant.content}\n${row.content}`
        : row.content;
      continue;
    }

    if (row.role === 'tool') {
      const parsed = parsePersistedToolContent(row.content);
      if (parsed && 'tool_result' in parsed) {
        const assistant = ensureAssistant();
        const invocation = assistant.toolInvocations?.find(
          (candidate) => candidate.id === parsed.tool_result.id,
        );
        if (invocation) {
          invocation.result = parsed.tool_result.result;
          if (parsed.tool_result.error) {
            invocation.error = parsed.tool_result.error;
          } else if (isLikelyErrorPayload(parsed.tool_result.result)) {
            invocation.error = parsed.tool_result.result.error;
          }
          if (parsed.tool_result.audit_id) {
            invocation.audit_id = parsed.tool_result.audit_id;
          }
          if (parsed.tool_result.compensating_available !== undefined) {
            invocation.compensating_available =
              parsed.tool_result.compensating_available;
          }
        }
      }
    }
  }

  flushAssistant();
  return messages;
}
