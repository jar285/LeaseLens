// Sprint 43.6 — scan-complete verdict emphasis gate. When the scan reaches
// review_ready, the verdict headline (the load-bearing "is this lease bad?"
// answer) does ONE subtle settle — informational sequencing that directs
// attention to the finding, NOT a celebration (tone invariant for legal-risk
// results). The gate fires once (keyed on the review-ready transition), never
// per grading tick, never before mount, never under reduced motion.

import { describe, expect, it } from 'vitest';
import { DURATION, EASE } from '@/lib/motion/presets';
import {
  shouldEmphasizeVerdict,
  VERDICT_SETTLE_TRANSITION,
} from './verdict-emphasis';

describe('shouldEmphasizeVerdict (Sprint 43.6)', () => {
  it('emphasizes once review is ready, mounted, and motion is enabled', () => {
    expect(shouldEmphasizeVerdict(true, true, false)).toBe(true);
  });

  it('does not emphasize before review is ready (no per-tick settle)', () => {
    expect(shouldEmphasizeVerdict(false, true, false)).toBe(false);
  });

  it('does not emphasize before mount (no flash on rehydration)', () => {
    expect(shouldEmphasizeVerdict(true, false, false)).toBe(false);
  });

  it('collapses to instant under reduced motion', () => {
    expect(shouldEmphasizeVerdict(true, true, true)).toBe(false);
  });

  it('treats a null reduced-motion reading as motion-enabled', () => {
    expect(shouldEmphasizeVerdict(true, true, null)).toBe(true);
  });
});

describe('VERDICT_SETTLE_TRANSITION (Sprint 43.6)', () => {
  it('uses the tokenized base duration + standard easing', () => {
    expect(VERDICT_SETTLE_TRANSITION.duration).toBe(DURATION.base);
    expect(VERDICT_SETTLE_TRANSITION.ease).toBe(EASE.standard);
  });
});
