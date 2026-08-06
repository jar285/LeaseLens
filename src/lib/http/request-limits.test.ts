// Sprint A.8 (#8) — unit tests for the request-size predicates. Pure functions,
// so the body/message guards are tested deterministically here rather than
// through a constructed Request (Content-Length is UA-controlled and can't be
// set reliably by test request builders).

import { describe, expect, it } from 'vitest';
import {
  exceedsContentLengthLimit,
  exceedsMessageLength,
} from './request-limits';

describe('exceedsContentLengthLimit', () => {
  it('is false when the header is missing (chunked/omitted requests pass)', () => {
    expect(exceedsContentLengthLimit(null, 1000)).toBe(false);
    expect(exceedsContentLengthLimit(undefined, 1000)).toBe(false);
  });

  it('is false when within the budget, true when over', () => {
    expect(exceedsContentLengthLimit('1000', 1000)).toBe(false);
    expect(exceedsContentLengthLimit('999', 1000)).toBe(false);
    expect(exceedsContentLengthLimit('1001', 1000)).toBe(true);
  });

  it('treats a non-numeric header as absent (not an overflow)', () => {
    expect(exceedsContentLengthLimit('not-a-number', 1000)).toBe(false);
  });
});

describe('exceedsMessageLength', () => {
  it('is true only above the char budget (empty is handled by the schema)', () => {
    expect(exceedsMessageLength('', 10)).toBe(false);
    expect(exceedsMessageLength('a'.repeat(10), 10)).toBe(false);
    expect(exceedsMessageLength('a'.repeat(11), 10)).toBe(true);
  });
});
