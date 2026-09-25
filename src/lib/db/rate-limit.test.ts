import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './index';
import { checkAndIncrementRateLimit } from './rate-limit';

const SESSION = 'test-session-id';

describe('checkAndIncrementRateLimit', () => {
  beforeEach(async () => {
    await db.prepare('DELETE FROM rate_limit').run();
  });

  it('allows first request and returns remaining 9', async () => {
    const result = await checkAndIncrementRateLimit(SESSION);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('allows 10th request and returns remaining 0', async () => {
    for (let i = 0; i < 9; i++) {
      await checkAndIncrementRateLimit(SESSION);
    }
    const tenth = await checkAndIncrementRateLimit(SESSION);
    expect(tenth.allowed).toBe(true);
    expect(tenth.remaining).toBe(0);
  });

  it('blocks 11th request and returns allowed false', async () => {
    for (let i = 0; i < 10; i++) {
      await checkAndIncrementRateLimit(SESSION);
    }
    const eleventh = await checkAndIncrementRateLimit(SESSION);
    expect(eleventh.allowed).toBe(false);
    expect(eleventh.remaining).toBe(0);
  });

  it('resets window when window_start is older than 3600 seconds', async () => {
    // Exhaust the limit
    for (let i = 0; i < 10; i++) {
      await checkAndIncrementRateLimit(SESSION);
    }

    // Backdate window_start by 3601 seconds
    const expiredStart = Math.floor(Date.now() / 1000) - 3601;
    await db
      .prepare('UPDATE rate_limit SET window_start = ? WHERE session_id = ?')
      .run(expiredStart, SESSION);

    // Should now allow and reset the window
    const result = await checkAndIncrementRateLimit(SESSION);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('does not share counts between different session IDs', async () => {
    const resultA = await checkAndIncrementRateLimit('session-a');
    const resultB = await checkAndIncrementRateLimit('session-b');
    expect(resultA.remaining).toBe(9);
    expect(resultB.remaining).toBe(9);
  });
});
