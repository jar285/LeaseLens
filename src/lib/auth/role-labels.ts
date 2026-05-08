// Sprint 13 — RBAC label bridge.
//
// Charter v1.13 §5.6 keeps the DB-level role identifiers as
// `Creator | Editor | Admin` to avoid a mid-pivot schema rewrite. The
// UI, system prompt, and tool descriptors render the LeaseLens names
// (Tenant, Reviewer, Admin). This module is the single mapping point;
// every human-facing surface imports `labelFor(role)` rather than
// hard-coding labels inline.

import type { Role } from './types';

export const ROLE_LABELS: Record<Role, string> = {
  Creator: 'Tenant',
  Editor: 'Reviewer',
  Admin: 'Admin',
};

export function labelFor(role: Role): string {
  return ROLE_LABELS[role];
}
