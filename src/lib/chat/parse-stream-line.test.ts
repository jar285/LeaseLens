import { describe, expect, it } from 'vitest';
import { parseStreamLine } from './parse-stream-line';

describe('parseStreamLine', () => {
  it('parses a conversationId line', () => {
    const result = parseStreamLine(
      JSON.stringify({ conversationId: 'conv-123' }),
    );
    expect(result).toEqual({ conversationId: 'conv-123' });
  });

  it('parses a chunk line', () => {
    const result = parseStreamLine(JSON.stringify({ chunk: 'Hello world' }));
    expect(result).toEqual({ chunk: 'Hello world' });
  });

  it('parses an error line', () => {
    const result = parseStreamLine(
      JSON.stringify({ error: 'Something went wrong' }),
    );
    expect(result).toEqual({ error: 'Something went wrong' });
  });

  it('parses a quota line', () => {
    const result = parseStreamLine(JSON.stringify({ quota: { remaining: 2 } }));
    expect(result).toEqual({ quota: { remaining: 2 } });
  });

  // Sprint D.12b (#12) — quota widened to carry the window limit so the
  // client can render a usage meter (remaining / limit).
  it('parses a widened quota line with remaining + limit', () => {
    const result = parseStreamLine(
      JSON.stringify({ quota: { remaining: 24, limit: 60 } }),
    );
    expect(result).toEqual({ quota: { remaining: 24, limit: 60 } });
  });

  // Sprint D.12b (#12) — typed budget event. Replaces the demo-copy
  // spend-ceiling {chunk}; scope says WHICH limit paused the assistant
  // ('daily' shared budget vs 'rate' per-visitor window).
  it('parses a budget event with scope daily', () => {
    const result = parseStreamLine(
      JSON.stringify({ budget: { scope: 'daily', requestId: 'REQ-9' } }),
    );
    expect(result).toEqual({ budget: { scope: 'daily', requestId: 'REQ-9' } });
  });

  it('parses a budget event with scope rate + retryAfterSeconds', () => {
    const result = parseStreamLine(
      JSON.stringify({ budget: { scope: 'rate', retryAfterSeconds: 1800 } }),
    );
    expect(result).toEqual({
      budget: { scope: 'rate', retryAfterSeconds: 1800 },
    });
  });

  it('returns null for a budget event with an unknown or missing scope', () => {
    expect(
      parseStreamLine(JSON.stringify({ budget: { scope: 'weekly' } })),
    ).toBeNull();
    expect(parseStreamLine(JSON.stringify({ budget: {} }))).toBeNull();
    expect(parseStreamLine(JSON.stringify({ budget: 'bad' }))).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseStreamLine('not-json')).toBeNull();
    expect(parseStreamLine('{broken')).toBeNull();
    expect(parseStreamLine('')).toBeNull();
  });

  it('returns null for a valid JSON object with no recognised keys', () => {
    expect(parseStreamLine(JSON.stringify({ unknown: 'field' }))).toBeNull();
  });

  it('returns null for a JSON primitive (not an object)', () => {
    expect(parseStreamLine('"just a string"')).toBeNull();
    expect(parseStreamLine('42')).toBeNull();
    expect(parseStreamLine('null')).toBeNull();
  });

  it('returns null when conversationId is not a string', () => {
    expect(parseStreamLine(JSON.stringify({ conversationId: 123 }))).toBeNull();
  });

  it('returns null when quota value is not an object', () => {
    expect(parseStreamLine(JSON.stringify({ quota: 'bad' }))).toBeNull();
    expect(parseStreamLine(JSON.stringify({ quota: null }))).toBeNull();
  });

  it('parses a max_tokens truncation event', () => {
    const result = parseStreamLine(
      JSON.stringify({ truncated: true, reason: 'max_tokens' }),
    );
    expect(result).toEqual({ truncated: true, reason: 'max_tokens' });
  });

  it('returns null when truncated is missing reason or has unknown reason', () => {
    expect(parseStreamLine(JSON.stringify({ truncated: true }))).toBeNull();
    expect(
      parseStreamLine(
        JSON.stringify({ truncated: true, reason: 'something_else' }),
      ),
    ).toBeNull();
    expect(
      parseStreamLine(
        JSON.stringify({ truncated: false, reason: 'max_tokens' }),
      ),
    ).toBeNull();
  });
});
