// Sprint 43.4 — capped list-entrance stagger.
//
// A staggered entrance turns a bulk-snap (e.g. the whole clause list appearing
// at once when extract_clauses lands) into a calm cascade. But on a long list a
// fixed per-item delay would push the tail seconds out — withholding content
// the user wants to scan (parser-first). So the per-item step SHRINKS with count
// so the last item's delay (step * (count-1)) never exceeds `capTotalSeconds`.

import { STAGGER } from './presets';

// The whole cascade lands within this budget regardless of list length.
export const LIST_STAGGER_CAP_SECONDS = 0.4;

export function cappedStaggerStep(
  count: number,
  step: number = STAGGER,
  capTotalSeconds: number = LIST_STAGGER_CAP_SECONDS,
): number {
  if (count <= 1) return step;
  return Math.min(step, capTotalSeconds / (count - 1));
}
