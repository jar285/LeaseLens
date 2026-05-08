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
 * Sprint 14 regression fix — when a user message's content array
 * contains tool_result blocks AT THE FRONT of the trimmed window,
 * those tool_result blocks are ORPHANS: their matching tool_use blocks
 * were in an assistant message that got dropped to fit the window.
 * The Anthropic API rejects orphan tool_result blocks with:
 *   `Each tool_result block must have a corresponding tool_use block
 *    in the previous message.`
 * After trimming, we keep dropping leading messages until the first
 * is a clean user start (text or content blocks with no tool_result).
 */
function isOrphanLeadingToolResult(msg: ContextMessage): boolean {
  if (msg.role !== 'user') return false;
  if (typeof msg.content === 'string') return false;
  return msg.content.some(
    (block) =>
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: string }).type === 'tool_result',
  );
}

/**
 * Trim from the front to stay within message count and character budgets.
 * The resulting window always starts with a user message (Anthropic requirement)
 * AND that user message must NOT lead with a tool_result block whose tool_use
 * has been trimmed off (Sprint 14 regression fix).
 *
 * Sprint 14 follow-up — the original drop-orphan loop has an edge case: if
 * char-budget trim chops the kicking-off user-text message off the front of
 * a long tool-heavy turn (e.g. a 15-clause "standard scan"), the only user
 * messages left are tool_result blocks. The drop loop then strips every pair
 * until trimmed.length === 1, leaving a single orphan tool_result the loop's
 * `trimmed.length > 1` guard refuses to drop — Anthropic returns 400. Fix:
 * locate the most-recent clean user-text message and pin it as an "anchor"
 * that neither the count nor the char trim is allowed to cross. Without
 * the anchor, the assistant's pile of tool_results has no kicking-off turn
 * to reference and the request is invalid by construction.
 */
function trimToLimits(messages: ContextMessage[]): ContextMessage[] {
  // Locate the most-recent clean user-text message.
  let anchorIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && !isOrphanLeadingToolResult(m)) {
      anchorIdx = i;
      break;
    }
  }

  // Cap by message count, never crossing the anchor.
  const countCap = Math.max(0, messages.length - MAX_MESSAGES);
  const startMin = anchorIdx >= 0 ? Math.min(countCap, anchorIdx) : countCap;
  let trimmed = messages.slice(startMin);
  let anchorInTrimmed = anchorIdx >= 0 ? anchorIdx - startMin : -1;

  // Cap by char budget, stopping if the next slice would drop the anchor.
  let totalChars = trimmed.reduce(
    (sum, m) => sum + contentLength(m.content),
    0,
  );
  while (totalChars > MAX_CHARS && trimmed.length > 1) {
    if (anchorInTrimmed === 0) break;
    totalChars -= contentLength(trimmed[0].content);
    trimmed = trimmed.slice(1);
    if (anchorInTrimmed > 0) anchorInTrimmed--;
  }

  // Drop until the first message is a CLEAN user start: role 'user'
  // AND no leading orphan tool_result (Sprint 14 fix).
  while (
    trimmed.length > 1 &&
    (trimmed[0].role !== 'user' || isOrphanLeadingToolResult(trimmed[0]))
  ) {
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
