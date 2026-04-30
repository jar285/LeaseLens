import { describe, expect, it } from 'vitest';
import {
  groundednessScore,
  meanReciprocalRank,
  precisionAtK,
  recallAtK,
} from './scoring';

describe('precisionAtK', () => {
  it('returns 1.0 for perfect retrieval', () => {
    expect(precisionAtK(['a', 'b'], ['a', 'b'], 2)).toBeCloseTo(1.0, 2);
  });

  it('returns correct fraction for partial retrieval', () => {
    expect(precisionAtK(['a', 'c', 'd'], ['a', 'b'], 3)).toBeCloseTo(1 / 3, 2);
  });
});

describe('recallAtK', () => {
  it('returns 1.0 when all expected found', () => {
    expect(recallAtK(['a', 'b', 'c'], ['a', 'b'])).toBeCloseTo(1.0, 2);
  });

  it('returns correct fraction when some expected missing', () => {
    expect(recallAtK(['a', 'c'], ['a', 'b', 'd'])).toBeCloseTo(1 / 3, 2);
  });
});

describe('meanReciprocalRank', () => {
  it('returns correct rank for hit at position 2', () => {
    expect(meanReciprocalRank(['x', 'a', 'y'], ['a', 'b'])).toBeCloseTo(0.5, 2);
  });
});

describe('groundednessScore', () => {
  it('returns correct fraction of keywords found', () => {
    expect(
      groundednessScore(['the cat sat'], ['cat', 'sat', 'dog']),
    ).toBeCloseTo(2 / 3, 2);
  });
});
