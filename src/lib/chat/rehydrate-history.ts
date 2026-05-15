import type {
  ChatMessageProps,
  ToolInvocation,
} from '@/components/chat/ChatMessage';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';

export type { ToolEvent };

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

/**
 * Sprint 25 — Pure rehydration of persisted tool_use/tool_result rows into
 * the ToolEvent[] shape that ChatStreamContext consumes. Pairs each
 * tool_use with its matching tool_result by id. Rows with a tool_use but
 * no matching tool_result are skipped (the live stream forwards events
 * only on tool_result anyway, so partial pairs would never appear in
 * the in-memory toolEvents array).
 *
 * Used by `src/app/page.tsx` to seed `ChatStreamProvider.initialEvents`
 * so the right-pane RedFlagReport rehydrates after role switch or
 * cockpit navigation, instead of going back to the empty state.
 *
 * Pure function — `rows in → events out`. No DB, no DOM, no React.
 */
export function rehydrateToolEvents(rows: ConversationRow[]): ToolEvent[] {
  const toolUseById = new Map<
    string,
    { name: string; input: Record<string, unknown> }
  >();
  const events: ToolEvent[] = [];

  for (const row of rows) {
    if (row.role !== 'assistant' && row.role !== 'tool') continue;
    const parsed = parsePersistedToolContent(row.content);
    if (!parsed) continue;

    if ('tool_use' in parsed) {
      toolUseById.set(parsed.tool_use.id, {
        name: parsed.tool_use.name,
        input: parsed.tool_use.input,
      });
      continue;
    }

    const use = toolUseById.get(parsed.tool_result.id);
    if (!use) continue;
    events.push({
      tool_name: parsed.tool_result.name ?? use.name,
      input: use.input,
      result: parsed.tool_result.result,
      audit_id: parsed.tool_result.audit_id,
    });
  }

  return events;
}
