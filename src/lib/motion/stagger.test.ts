// Sprint 43.4 — capped list-entrance stagger. The per-item step must shrink as
// a list grows so the LAST item's delay (step * (count-1)) never exceeds a small
// cap — a long clause list must not withhold its tail behind a slow reveal
// (parser-first: content scannable fast). Pure math so the budget is provable.

import { describe, expect, it } from 'vitest';
import { STAGGER } from './presets';
import { cappedStaggerStep, LIST_STAGGER_CAP_SECONDS } from './stagger';

describe('cappedStaggerStep (Sprint 43.4)', () => {
  it('uses the full step for short lists', () => {
    expect(cappedStaggerStep(5, 0.05, 0.4)).toBe(0.05);
  });

  it('shrinks the step so the total stays within the cap for long lists', () => {
    const step = cappedStaggerStep(21, 0.05, 0.4);
    expect(step).toBeCloseTo(0.02, 5); // 0.4 / 20
    expect(step * (21 - 1)).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it('never exceeds the cap for any count', () => {
    for (const n of [2, 7, 13, 50, 200]) {
      expect(cappedStaggerStep(n, 0.05, 0.4) * (n - 1)).toBeLessThanOrEqual(
        0.4 + 1e-9,
      );
    }
  });

  it('returns the step for a single item or empty list (no stagger needed)', () => {
    expect(cappedStaggerStep(1, 0.05, 0.4)).toBe(0.05);
    expect(cappedStaggerStep(0, 0.05, 0.4)).toBe(0.05);
  });

  it('defaults to the STAGGER token and the list cap', () => {
    expect(cappedStaggerStep(1)).toBe(STAGGER);
    expect(cappedStaggerStep(100)).toBeLessThanOrEqual(
      LIST_STAGGER_CAP_SECONDS / 99 + 1e-9,
    );
  });
});
