// Sprint 43.3 — Mode A->B flip gating + transition.
//
// The workspace fades in ONLY when the user just uploaded in-session
// (`freshUpload`) AND motion is not reduced. Two reasons it's gated this tightly:
//   - SSR rehydration of an existing lease must NOT animate — the workspace
//     should already be there on a normal page load, not flash in.
//   - reduced-motion collapses the flip to instant (WCAG).
//
// The animation is OPACITY-ONLY (no transform). The Mode B subtree includes the
// `fixed` AssistantFab, and a transform on an ancestor re-bases a fixed child's
// containing block (Motion can also leave a residual translateY(0)), which would
// break the FAB's positioning. Opacity is safe for fixed descendants and reads
// calm (Rams) — orientation, not spectacle.

import { DURATION, EASE } from '@/lib/motion/presets';

export function shouldAnimateModeFlip(
  freshUpload: boolean,
  reducedMotion: boolean | null,
): boolean {
  return freshUpload && !reducedMotion;
}

// Tokenized so the flip shares the system's curve and stays within the
// `enter` duration ceiling (orientation, not a wait).
export const MODE_FLIP_TRANSITION = {
  duration: DURATION.enter,
  ease: EASE.standard,
} as const;
