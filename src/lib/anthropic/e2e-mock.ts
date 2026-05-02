// E2E Anthropic mock client.
//
// Engaged when CONTENTOPS_E2E_MOCK === '1' (set by playwright.config.ts via
// webServer.env). Returns a thin object satisfying the parts of the Anthropic
// SDK that src/app/api/chat/route.ts uses: messages.create() and
// messages.stream().
//
// Behavior:
//   - When the latest message is a fresh user request (no tool_result blocks
//     present): returns a tool_use invoking schedule_content_item with the
//     seeded `brand-identity` slug.
//   - When the latest message is a tool_result (the chat route's second
//     create call after running the tool): returns end_turn with text.
//   - messages.stream() emits a single text delta then ends.
//
// Sprint-9 amendment: the mock used to track state via a `createCalls`
// counter, which broke across multiple Playwright tests in the same dev
// server lifetime (call #3+ never returned tool_use). The mock now inspects
// the message array directly so behavior is per-request, not per-process.
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
            { type: 'text', text: 'Scheduling that for you.' },
            {
              type: 'tool_use',
              id: 'toolu_e2e_schedule',
              name: 'schedule_content_item',
              input: {
                // Slug must exist in the seeded corpus — see src/corpus/.
                document_slug: 'brand-identity',
                // ISO 8601 string — Sprint 8 amendment. Server parses to
                // Unix seconds via parseIsoToUnixSeconds.
                scheduled_for: new Date(Date.now() + 86_400_000).toISOString(),
                channel: 'twitter',
              },
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
        content: [{ type: 'text', text: 'Scheduled.' }],
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
          content: [{ type: 'text', text: 'Scheduled.' }],
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
      };
      return stream;
    },
  };

  return { messages } as unknown as Anthropic;
}
