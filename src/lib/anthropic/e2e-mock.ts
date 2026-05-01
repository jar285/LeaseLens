// E2E Anthropic mock client.
//
// Engaged when CONTENTOPS_E2E_MOCK === '1' (set by playwright.config.ts via
// webServer.env). Returns a thin object satisfying the parts of the Anthropic
// SDK that src/app/api/chat/route.ts uses: messages.create() and
// messages.stream().
//
// Behavior:
//   - First call to messages.create(): returns a tool_use response invoking
//     schedule_content_item with the seeded `sqs-launch` slug.
//   - Subsequent calls (after the tool_result is appended): returns end_turn
//     with text content.
//   - messages.stream() emits a single text delta then ends.
//
// Used only during Playwright E2E. Never imported in production code paths.

import type Anthropic from '@anthropic-ai/sdk';

export function createE2EMockClient(): Anthropic {
  let createCalls = 0;

  const messages = {
    create: async () => {
      createCalls++;
      if (createCalls === 1) {
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
                scheduled_for: new Date(
                  Date.now() + 86_400_000,
                ).toISOString(),
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
