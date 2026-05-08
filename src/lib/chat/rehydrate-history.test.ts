import { describe, expect, it } from 'vitest';
import { rehydrateConversationMessages } from './rehydrate-history';

describe('rehydrateConversationMessages', () => {
  it('folds persisted tool rows into assistant toolInvocations', () => {
    const messages = rehydrateConversationMessages([
      { id: 'm1', role: 'user', content: 'Create a content plan' },
      {
        id: 'm2',
        role: 'assistant',
        content: JSON.stringify({
          tool_use: {
            id: 'tool-1',
            name: 'search_corpus',
            input: { query: 'brand voice' },
          },
        }),
      },
      {
        id: 'm3',
        role: 'tool',
        content: JSON.stringify({
          tool_result: {
            id: 'tool-1',
            result: { result_count: 3 },
          },
        }),
      },
      {
        id: 'm4',
        role: 'assistant',
        content:
          'Draft the first week around the platform vision and developer advocacy.',
      },
    ]);

    expect(messages).toEqual([
      { id: 'm1', role: 'user', content: 'Create a content plan' },
      {
        id: expect.any(String),
        role: 'assistant',
        content:
          'Draft the first week around the platform vision and developer advocacy.',
        toolInvocations: [
          {
            id: 'tool-1',
            name: 'search_corpus',
            input: { query: 'brand voice' },
            result: { result_count: 3 },
          },
        ],
      },
    ]);
  });
});
