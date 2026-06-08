// Sprint 43.1 — motion-token contract. These tokens are the single source of
// truth call-sites consume instead of inlining magic numbers; the spec freezes
// them as the system, so pin the contract: an ascending duration scale in
// seconds (Motion's `duration` unit), easing tokens that REUSE the existing
// arcs (one source for motion- and CSS-driven transitions), and a small stagger
// interval bounded so list entrance never withholds content.

import { describe, expect, it } from 'vitest';
import {
  DURATION,
  EASE,
  EASE_IN_OUT_SOFT,
  EASE_OUT_SOFT,
  STAGGER,
} from './presets';

describe('motion tokens (Sprint 43.1)', () => {
  it('exposes an ascending duration scale in seconds', () => {
    expect(DURATION.fast).toBeGreaterThan(0);
    expect(DURATION.fast).toBeLessThan(DURATION.base);
    expect(DURATION.base).toBeLessThan(DURATION.enter);
    // Motion `duration` is seconds, not ms — guard the unit so a stray 400
    // (ms) never lands here. `enter` doubles as the Mode A->B flip ceiling.
    expect(DURATION.enter).toBeLessThanOrEqual(1);
  });

  it('reuses the existing easing arcs as standard/exit (single source)', () => {
    expect(EASE.standard).toBe(EASE_OUT_SOFT);
    expect(EASE.exit).toBe(EASE_IN_OUT_SOFT);
  });

  it('exposes a small, bounded positive stagger interval (seconds)', () => {
    expect(STAGGER).toBeGreaterThan(0);
    expect(STAGGER).toBeLessThan(0.2);
  });
});
