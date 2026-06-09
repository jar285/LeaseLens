// Sprint 43.3 — Mode A->B flip gating. The workspace fades in ONLY when the
// user just uploaded in-session AND motion is not reduced. SSR rehydration of an
// existing lease must NOT animate (no flash on a normal page load), and
// reduced-motion collapses the flip to instant. Pure truth-table so the gating
// intent is explicit and testable (the opacity animation itself is gated by the
// 43.7 Playwright run, not observable in happy-dom).

import { describe, expect, it } from 'vitest';
import { DURATION, EASE } from '@/lib/motion/presets';
import { MODE_FLIP_TRANSITION, shouldAnimateModeFlip } from './workspace-flip';

describe('shouldAnimateModeFlip (Sprint 43.3)', () => {
  it('animates only on a fresh in-session upload with motion enabled', () => {
    expect(shouldAnimateModeFlip(true, false)).toBe(true);
  });

  it('does not animate an SSR-rehydrated workspace (no fresh upload)', () => {
    expect(shouldAnimateModeFlip(false, false)).toBe(false);
  });

  it('collapses to instant under reduced motion', () => {
    expect(shouldAnimateModeFlip(true, true)).toBe(false);
    expect(shouldAnimateModeFlip(false, true)).toBe(false);
  });

  it('treats a null reduced-motion reading as motion-enabled', () => {
    expect(shouldAnimateModeFlip(true, null)).toBe(true);
  });
});

describe('MODE_FLIP_TRANSITION (Sprint 43.3)', () => {
  it('uses the tokenized enter duration as the flip ceiling', () => {
    expect(MODE_FLIP_TRANSITION.duration).toBe(DURATION.enter);
  });

  it('uses the standard easing token', () => {
    expect(MODE_FLIP_TRANSITION.ease).toBe(EASE.standard);
  });
});
