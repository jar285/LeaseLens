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
});
