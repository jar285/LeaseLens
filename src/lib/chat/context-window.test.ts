import { describe, expect, it } from 'vitest';
import {
  buildContextWindow,
  type ContextMessage,
  normalizeAlternation,
} from './context-window';

describe('normalizeAlternation', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeAlternation([])).toEqual([]);
  });

  it('leaves correctly alternating messages unchanged', () => {
    const input: ContextMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'How are you?' },
    ];
    expect(normalizeAlternation(input)).toEqual(input);
  });

  it('merges consecutive user messages into one', () => {
    const input: ContextMessage[] = [
      { role: 'user', content: 'First' },
      { role: 'user', content: 'Second' },
      { role: 'assistant', content: 'Reply' },
    ];
    const result = normalizeAlternation(input);
    expect(result).toHaveLength(2);
    expect(result[0].role).toBe('user');
    expect(result[0].content).toBe('First\n\nSecond');
    expect(result[1].role).toBe('assistant');
  });

  it('merges consecutive assistant messages into one', () => {
    const input: ContextMessage[] = [
      { role: 'user', content: 'Question' },
      { role: 'assistant', content: 'Part A' },
      { role: 'assistant', content: 'Part B' },
    ];
    const result = normalizeAlternation(input);
    expect(result).toHaveLength(2);
    expect(result[1].content).toBe('Part A\n\nPart B');
  });
});

describe('buildContextWindow', () => {
  it('returns empty contextMessages and trimmed false for empty input', () => {
    const result = buildContextWindow([]);
    expect(result.contextMessages).toEqual([]);
    expect(result.trimmed).toBe(false);
  });

  it('returns all messages and trimmed false when within budget', () => {
    const input: ContextMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
    ];
    const result = buildContextWindow(input);
    expect(result.contextMessages).toHaveLength(3);
    expect(result.trimmed).toBe(false);
  });

  it('trims to MAX_MESSAGES when history exceeds 20 and starts with user', () => {
    // 22 messages: 11 user/assistant pairs — trim to last 20, still starts with user
    const input: ContextMessage[] = Array.from({ length: 22 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
    }));

    const result = buildContextWindow(input);
    expect(result.contextMessages.length).toBeLessThanOrEqual(20);
    expect(result.contextMessages[0].role).toBe('user');
    expect(result.trimmed).toBe(true);
  });

  it('trims when total characters exceed MAX_CHARS (40000)', () => {
    // Two messages whose combined length exceeds 40000 chars
    const bigContent = 'x'.repeat(25_000);
    const input: ContextMessage[] = [
      { role: 'user', content: bigContent },
      { role: 'assistant', content: bigContent },
      { role: 'user', content: 'Short question' },
    ];

    const result = buildContextWindow(input);
    const totalChars = result.contextMessages.reduce(
      (sum, m) => sum + m.content.length,
      0,
    );
    expect(totalChars).toBeLessThanOrEqual(40_000);
    expect(result.trimmed).toBe(true);
  });

  it('window always starts with a user message after trimming', () => {
    // 22 messages starting with user — after trim last 20 starts with assistant (index 2)
    // but the role-guard drops leading assistant messages
    const input: ContextMessage[] = Array.from({ length: 22 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
    }));

    const result = buildContextWindow(input);
    if (result.contextMessages.length > 0) {
      expect(result.contextMessages[0].role).toBe('user');
    }
  });

  it('Sprint 14 regression — drops leading orphan tool_result blocks after trim', () => {
    // Reproduces the live "tool_use_id found in tool_result blocks: …
    // Each tool_result block must have a corresponding tool_use block
    // in the previous message" 400 from Anthropic. Long scan history
    // → trimToLimits drops the assistant tool_use rows from the front
    // → the matching tool_result blocks are stranded at position 0.
    // The leading drop loop must continue past those orphans until it
    // finds a clean user start.
    const longContent = 'X'.repeat(20_000); // forces aggressive trim
    const input: ContextMessage[] = [
      { role: 'user', content: 'scan' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'A', name: 'extract_clauses', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'A', content: longContent },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'B',
            name: 'grade_clause_severity',
            input: {},
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'B', content: longContent },
        ],
      },
      {
        role: 'assistant',
        content: 'Final summary text — clean assistant message.',
      },
      // A clean follow-up user turn that should survive the trim.
      { role: 'user', content: 'Now what?' },
    ];

    const result = buildContextWindow(input);
    // The first kept message must NOT have an orphan tool_result block.
    const firstContent = result.contextMessages[0].content;
    if (Array.isArray(firstContent)) {
      const hasToolResult = firstContent.some(
        (block) =>
          typeof block === 'object' &&
          block !== null &&
          (block as { type?: string }).type === 'tool_result',
      );
      expect(hasToolResult).toBe(false);
    }
    expect(result.contextMessages[0].role).toBe('user');
  });

  it('keeps interior tool_result blocks (their tool_use is in the previous message)', () => {
    // tool_result is only an "orphan" at position 0. Mid-history
    // tool_results paired with the preceding assistant tool_use are
    // valid Anthropic content and must NOT be stripped.
    const input: ContextMessage[] = [
      { role: 'user', content: 'scan' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'I will extract clauses.' },
          { type: 'tool_use', id: 'A', name: 'extract_clauses', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'A', content: '{"clauses":[]}' },
        ],
      },
      { role: 'assistant', content: 'Done.' },
    ];

    const result = buildContextWindow(input);
    expect(result.contextMessages).toHaveLength(4);
    // Interior tool_result preserved at index 2.
    const interior = result.contextMessages[2].content;
    expect(Array.isArray(interior)).toBe(true);
  });
});
