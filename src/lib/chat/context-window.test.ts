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

  it('trims to MAX_MESSAGES when history exceeds the cap and starts with user', () => {
    // Sprint 23e — cap bumped from 20 to 60. Use 62 messages so the
    // trim still fires; the assertion follows the cap.
    const input: ContextMessage[] = Array.from({ length: 62 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `Message ${i}`,
    }));

    const result = buildContextWindow(input);
    expect(result.contextMessages.length).toBeLessThanOrEqual(60);
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
    // Sprint 23e — cap bumped to 60. Use 62 messages so the trim
    // fires and the role-guard still has to drop a leading assistant.
    const input: ContextMessage[] = Array.from({ length: 62 }, (_, i) => ({
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

  it('Sprint 14 follow-up — pins user-text anchor when scan tool history exceeds char budget', () => {
    // Reproduces the 15-clause "standard scan" 400. The original
    // drop-orphan loop guards `trimmed.length > 1`, so when the
    // char-budget trim chops the kicking-off "Run the standard scan"
    // anchor and the only remaining user messages are tool_result
    // blocks, the drop loop reduces the window to a single orphan and
    // sends it. The fix pins the most-recent clean user-text message
    // so neither the count nor the char trim can cross it.
    const bigToolResult = 'Y'.repeat(8_000);
    const input: ContextMessage[] = [
      { role: 'user', content: 'Run the standard scan' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'A', name: 'extract_clauses', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'A', content: bigToolResult },
        ],
      },
      // 6 grade_clause_severity rounds, each ~8 KB of tool_result —
      // total well over the 40 KB budget so char-trim is forced to act.
      ...Array.from({ length: 6 }, (_, i) => [
        {
          role: 'assistant' as const,
          content: [
            {
              type: 'tool_use',
              id: `G${i}`,
              name: 'grade_clause_severity',
              input: {},
            },
          ],
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result',
              tool_use_id: `G${i}`,
              content: bigToolResult,
            },
          ],
        },
      ]).flat(),
    ];

    const result = buildContextWindow(input);
    // The window must start with the anchor, not an orphan tool_result.
    expect(result.contextMessages[0].role).toBe('user');
    expect(result.contextMessages[0].content).toBe('Run the standard scan');
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

  // Sprint 23e — full-scan survival across a follow-up turn.
  //
  // Bug surfaced during the 23d smoke walk: after a 15-clause scan,
  // turn-2 ("rank the red flags") re-ran the scan tools wastefully,
  // and turn-3 ("draft emails") replied "I don't have a record of
  // clause gradings". Root cause: MAX_MESSAGES = 20 was too small for
  // the ~34-message scan transcript, so trim + orphan-drop stripped
  // most tool_result blocks before the model could see them.
  //
  // This test builds the canonical post-scan transcript and asserts
  // that EVERY grade_clause_severity tool_use + tool_result pair plus
  // the extract_clauses pair survives the window when a follow-up
  // user message is appended. The window must also remain valid for
  // Anthropic (start with a user message).
  describe('Sprint 23e — full-scan survival', () => {
    function countToolBlocks(
      messages: ContextMessage[],
      blockType: 'tool_use' | 'tool_result',
      toolName?: string,
    ): number {
      let count = 0;
      for (const msg of messages) {
        if (typeof msg.content === 'string') continue;
        for (const block of msg.content) {
          if (typeof block !== 'object' || block === null) continue;
          const b = block as { type?: string; name?: string };
          if (b.type !== blockType) continue;
          if (toolName && b.name !== toolName) continue;
          count += 1;
        }
      }
      return count;
    }

    it('preserves all 15 grade_clause_severity tool_result blocks after a follow-up turn', () => {
      // Build a 34-message scan transcript: 1 user kickoff + 1
      // extract_clauses pair + 15 grade_clause_severity pairs + 1
      // assistant summary, then a 35th user follow-up message.
      const transcript: ContextMessage[] = [
        { role: 'user', content: 'Run a standard scan on this lease.' },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'tu-extract',
              name: 'extract_clauses',
              input: { lease_id: 'lease-1' },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tu-extract',
              content: JSON.stringify({
                clauses: Array.from({ length: 15 }, (_, i) => ({
                  clause_id: `c${i + 1}`,
                  clause_type: 'security_deposit',
                  clause_index: i,
                })),
              }),
            },
          ],
        },
      ];

      // 15 × {assistant tool_use grade_clause_severity, user tool_result}
      for (let i = 0; i < 15; i++) {
        transcript.push({
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: `tu-grade-${i + 1}`,
              name: 'grade_clause_severity',
              input: { clause_id: `c${i + 1}` },
            },
          ],
        });
        transcript.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: `tu-grade-${i + 1}`,
              content: JSON.stringify({
                clause_id: `c${i + 1}`,
                severity: 'high',
                statute_citation: 'NJ Stat 46:8-19',
                chunk_id: 'security-deposit-cap',
                reasoning: 'Two months exceeds 1.5-month cap.',
                recommended_action: 'Negotiate to 1.5 months.',
                page_number: 1,
              }),
            },
          ],
        });
      }

      // Final assistant text summary + user follow-up.
      transcript.push({
        role: 'assistant',
        content: 'Lease Scan Complete: 15 red flags graded.',
      });
      transcript.push({
        role: 'user',
        content:
          'Draft polished negotiation emails for the high-severity clauses.',
      });

      // Sanity: 34 + 1 = 35 messages constructed.
      expect(transcript).toHaveLength(35);

      const result = buildContextWindow(transcript);

      // All 15 grade_clause_severity tool_use blocks survive.
      const gradeUseCount = countToolBlocks(
        result.contextMessages,
        'tool_use',
        'grade_clause_severity',
      );
      expect(gradeUseCount).toBe(15);

      // All 16 tool_result blocks survive (1 extract + 15 gradings).
      const totalResultCount = countToolBlocks(
        result.contextMessages,
        'tool_result',
      );
      expect(totalResultCount).toBe(16);

      // The extract_clauses tool_use survives.
      const extractUseCount = countToolBlocks(
        result.contextMessages,
        'tool_use',
        'extract_clauses',
      );
      expect(extractUseCount).toBe(1);

      // Window starts with a user message (Anthropic requirement).
      expect(result.contextMessages[0]?.role).toBe('user');

      // No trim happened — the window is large enough.
      expect(result.trimmed).toBe(false);
    });
  });
});
