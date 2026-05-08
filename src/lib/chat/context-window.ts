// Phase 10.8.3 — content can be a plain string OR an array of
// Anthropic content blocks (text / tool_use / tool_result). Persisted
// tool_use and tool_result rows render as PROPER content blocks so
// the model sees real `tool_use` parts in its history instead of
// fake `[Tool use: <name>]` text — which the model was mirroring
// into its own output. We keep the array element type as `unknown`
// here so context-window doesn't have to import the Anthropic SDK
// types; the route layer is the one that actually constructs them.
export type ContextMessageContent = string | unknown[];

export type ContextMessage = {
  role: 'user' | 'assistant';
  content: ContextMessageContent;
};

const MAX_MESSAGES = 20;
const MAX_CHARS = 40_000;

function contentLength(content: ContextMessageContent): number {
  return typeof content === 'string'
    ? content.length
    : JSON.stringify(content).length;
}

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
      const a = prev.content;
      const b = messages[i].content;
      // String + string → concat. Otherwise concat as array of
      // blocks: a string becomes a `text` block, an array stays as
      // its blocks. Anthropic accepts mixed-block arrays, and this
      // preserves tool_use / tool_result fidelity through alternation
      // normalization.
      if (typeof a === 'string' && typeof b === 'string') {
        prev.content = `${a}\n\n${b}`;
      } else {
        const aParts = typeof a === 'string' ? [{ type: 'text', text: a }] : a;
        const bParts = typeof b === 'string' ? [{ type: 'text', text: b }] : b;
        prev.content = [...aParts, ...bParts];
      }
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

  let totalChars = trimmed.reduce(
    (sum, m) => sum + contentLength(m.content),
    0,
  );
  while (totalChars > MAX_CHARS && trimmed.length > 1) {
    totalChars -= contentLength(trimmed[0].content);
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
