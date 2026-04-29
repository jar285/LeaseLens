import { describe, expect, it } from 'vitest';
import { buildBM25Index, type ChunkRow, scoreBM25, tokenize } from './bm25';

describe('bm25', () => {
  it('tokenize lowercases and filters short tokens', () => {
    expect(tokenize('Hello World a')).toEqual(['hello', 'world']);
  });

  it('buildBM25Index computes correct docCount and avgDocLength', () => {
    const chunks: ChunkRow[] = [
      { id: 'a', content: 'foo bar baz' },
      { id: 'b', content: 'foo qux' },
    ];
    const index = buildBM25Index(chunks);

    expect(index.docCount).toBe(2);
    expect(index.avgDocLength).toBe(2.5);
  });

  it('scoreBM25 returns higher score for matching chunk', () => {
    const chunks: ChunkRow[] = [
      { id: 'match', content: 'brand voice guidelines' },
      { id: 'miss', content: 'content calendar schedule' },
    ];
    const index = buildBM25Index(chunks);
    const queryTerms = tokenize('brand');

    const matchTokens = tokenize('brand voice guidelines');
    const matchScore = scoreBM25(
      queryTerms,
      matchTokens,
      index.docLengths.get('match') ?? 0,
      index,
    );

    const missTokens = tokenize('content calendar schedule');
    const missScore = scoreBM25(
      queryTerms,
      missTokens,
      index.docLengths.get('miss') ?? 0,
      index,
    );

    expect(matchScore).toBeGreaterThan(missScore);
    expect(missScore).toBe(0);
  });
});
