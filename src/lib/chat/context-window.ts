export type ContextMessage = { role: 'user' | 'assistant'; content: string };

const MAX_MESSAGES = 20;
const MAX_CHARS = 40_000;

/**
 * Merge consecutive same-role messages into one.
 * Anthropic requires strict user/assistant alternation.
 * Adapted from docs/_references/ai_mcp_chat_ordo/src/lib/chat/context-window.ts
 */
export function normalizeAlternation(
  messages: ContextMessage[],
): ContextMessage[] {
  if (messages.length === 0) return [];

  const merged: ContextMessage[] = [{ ...messages[0] }];

  for (let i = 1; i < messages.length; i++) {
    const prev = merged[merged.length - 1];
    if (messages[i].role === prev.role) {
      prev.content = `${prev.content}\n\n${messages[i].content}`;
    } else {
      merged.push({ ...messages[i] });
    }
  }

  return merged;
}

/**
 * Trim from the front to stay within message count and character budgets.
 * The resulting window always starts with a user message (Anthropic requirement).
 */
function trimToLimits(messages: ContextMessage[]): ContextMessage[] {
  let trimmed =
    messages.length > MAX_MESSAGES
      ? messages.slice(messages.length - MAX_MESSAGES)
      : [...messages];

  let totalChars = trimmed.reduce((sum, m) => sum + m.content.length, 0);
  while (totalChars > MAX_CHARS && trimmed.length > 1) {
    totalChars -= trimmed[0].content.length;
    trimmed = trimmed.slice(1);
  }

  while (trimmed.length > 1 && trimmed[0].role !== 'user') {
    trimmed = trimmed.slice(1);
  }

  return trimmed;
}

export function buildContextWindow(rawMessages: ContextMessage[]): {
  contextMessages: ContextMessage[];
  trimmed: boolean;
} {
  const normalized = normalizeAlternation(rawMessages);
  const contextMessages = trimToLimits(normalized);

  return {
    contextMessages,
    trimmed: contextMessages.length < normalized.length,
  };
}
