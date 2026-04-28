import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index';
import { checkAndIncrementRateLimit } from './rate-limit';

const SESSION = 'test-session-id';

describe('checkAndIncrementRateLimit', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM rate_limit').run();
  });

  it('allows first request and returns remaining 9', () => {
    const result = checkAndIncrementRateLimit(SESSION);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('allows 10th request and returns remaining 0', () => {
    for (let i = 0; i < 9; i++) {
      checkAndIncrementRateLimit(SESSION);
    }
    const tenth = checkAndIncrementRateLimit(SESSION);
    expect(tenth.allowed).toBe(true);
    expect(tenth.remaining).toBe(0);
  });

  it('blocks 11th request and returns allowed false', () => {
    for (let i = 0; i < 10; i++) {
      checkAndIncrementRateLimit(SESSION);
    }
    const eleventh = checkAndIncrementRateLimit(SESSION);
    expect(eleventh.allowed).toBe(false);
    expect(eleventh.remaining).toBe(0);
  });

  it('resets window when window_start is older than 3600 seconds', () => {
    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      checkAndIncrementRateLimit(SESSION);
    }

    // Backdate window_start by 3601 seconds
    const expiredStart = Math.floor(Date.now() / 1000) - 3601;
    db.prepare(
      'UPDATE rate_limit SET window_start = ? WHERE session_id = ?',
    ).run(expiredStart, SESSION);

    // Should now allow and reset the window
    const result = checkAndIncrementRateLimit(SESSION);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('does not share counts between different session IDs', () => {
    const resultA = checkAndIncrementRateLimit('session-a');
    const resultB = checkAndIncrementRateLimit('session-b');
    expect(resultA.remaining).toBe(9);
    expect(resultB.remaining).toBe(9);
  });
});
