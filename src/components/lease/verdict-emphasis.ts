// Sprint 43.6 — scan-complete verdict emphasis.
//
// When the scan reaches review_ready, the verdict headline (the load-bearing
// "is this lease bad?" answer) does ONE subtle settle — informational
// sequencing that directs attention to the finding, NOT a celebration (the
// tone invariant: a confetti-feel on "4 serious red flags" undermines trust).
// Gated so it fires once (the component keys the headline on the review-ready
// transition), never per grading tick, never before mount, never under reduced
// motion.

import { DURATION, EASE } from '@/lib/motion/presets';

export function shouldEmphasizeVerdict(
  isReviewReady: boolean,
  mounted: boolean,
  reducedMotion: boolean | null,
): boolean {
  return isReviewReady && mounted && !reducedMotion;
}

// Tokenized so the settle shares the system's curve. A gentle base-duration
// fade+rise, no spring/overshoot (sober).
export const VERDICT_SETTLE_TRANSITION = {
  duration: DURATION.base,
  ease: EASE.standard,
} as const;
