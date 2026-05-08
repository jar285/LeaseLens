// E2E Anthropic mock client.
//
// Engaged when LEASELENS_E2E_MOCK === '1' (set by playwright.config.ts via
// webServer.env). Returns a thin object satisfying the parts of the Anthropic
// SDK that src/app/api/chat/route.ts uses: messages.create() and
// messages.stream().
//
// Sprint 14 / Phase 13 — repointed from the deleted ContentOps tool surface
// (`schedule_content_item`, `approve_draft`) to the LeaseLens tool surface
// (`extract_clauses`, `grade_clause_severity`). Behaviour follows the same
// two-step state machine the original used (inspect message array per call):
//
//   - When the latest message is a fresh user request (no tool_result blocks
//     present): returns a tool_use invoking `extract_clauses` against the
//     conversation's active lease — the real chat route would resolve the
//     lease via the recent-upload fallback.
//   - When the latest message is a tool_result: returns end_turn with text.
//
// Per-request inspection (not a per-process counter) so behaviour is stable
// across multiple Playwright tests in the same dev-server lifetime.
//
// Used only during Playwright E2E. Never imported in production code paths.

import type Anthropic from '@anthropic-ai/sdk';

interface CreateArgs {
  messages?: Array<{
    role: string;
    content: unknown;
  }>;
}

function lastMessageHasToolResult(args: CreateArgs): boolean {
  const last = args.messages?.[args.messages.length - 1];
  if (!last) return false;
  if (typeof last.content === 'string') return false;
  if (Array.isArray(last.content)) {
    return last.content.some(
      (block) =>
        typeof block === 'object' &&
        block !== null &&
        (block as { type?: string }).type === 'tool_result',
    );
  }
  return false;
}

export function createE2EMockClient(): Anthropic {
  const messages = {
    create: async (args: CreateArgs = {}) => {
      const isToolResultFollowup = lastMessageHasToolResult(args);
      if (!isToolResultFollowup) {
        return {
          id: 'msg_e2e_1',
          type: 'message',
          role: 'assistant',
          model: 'mock',
          stop_reason: 'tool_use',
          stop_sequence: null,
          content: [
            {
              type: 'text',
              text: "I'll extract the clauses from your lease.",
            },
            {
              type: 'tool_use',
              id: 'toolu_e2e_extract',
              name: 'extract_clauses',
              // No input args needed — extract_clauses resolves the
              // active lease via the conversation binding (or the
              // recent-upload fallback).
              input: {},
            },
          ],
          usage: { input_tokens: 0, output_tokens: 0 },
        };
      }
      return {
        id: 'msg_e2e_2',
        type: 'message',
        role: 'assistant',
        model: 'mock',
        stop_reason: 'end_turn',
        stop_sequence: null,
        content: [
          {
            type: 'text',
            text: 'Extracted the clauses. Let me know which ones to grade against NJ tenant law.',
          },
        ],
        usage: { input_tokens: 0, output_tokens: 0 },
      };
    },
    stream: () => {
      // Mimic the messages.stream() shape the chat route uses:
      // .on() event-subscription chain + finalMessage().
      const noop = () => stream;
      const stream = {
        on: noop,
        finalMessage: async () => ({
          id: 'msg_e2e_2',
          type: 'message',
          role: 'assistant',
          model: 'mock',
          stop_reason: 'end_turn',
          stop_sequence: null,
          content: [
            {
              type: 'text',
              text: 'Extracted the clauses. Let me know which ones to grade against NJ tenant law.',
            },
          ],
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
      };
      return stream;
    },
  };

  return { messages } as unknown as Anthropic;
}
