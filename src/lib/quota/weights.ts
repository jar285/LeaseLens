// Sprint C.17 (#17) — weighted quota actions. A quota window is spent by
// WEIGHT, not raw request count, so an expensive upload or a full scan draws
// down more of the budget than a single chat question (GoF Strategy: per-action
// cost policy in one place).
//
// Actions identifiable at the route boundary: `chat` (/api/chat), `scan` (an
// auto-scan turn, forceScan=true), `upload` (/api/leases). `draft` is a NESTED
// tool inside /api/chat, so its per-call weighting belongs with the budget
// ledger's per-call attribution (#5b), not the route-boundary quota; it is
// defined here for completeness but not yet charged at a route.

export type QuotaAction = 'chat' | 'upload' | 'scan' | 'draft';

export const QUOTA_WEIGHTS: Record<QuotaAction, number> = {
  chat: 1,
  upload: 3,
  scan: 5,
  draft: 2,
};

export function weightFor(action: QuotaAction): number {
  return QUOTA_WEIGHTS[action];
}
