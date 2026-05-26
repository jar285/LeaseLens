/**
 * Sprint 11 — Workspaces & Brand Onboarding.
 *
 * The sample workspace is the default one-click path on the landing page.
 * Its UUID is stable across boots so existing per-data tables (audit_log,
 * documents, etc.) can default-backfill to it during the migration step.
 * Spec §4.2.
 */

export const SAMPLE_WORKSPACE = {
  // Sprint 13 (charter v1.13) — id is unchanged so existing audit_log /
  // documents / chunks rows referencing this workspace remain valid.
  // Name + description switched from the Side Quest Syndicate framing
  // to the LeaseLens NJ tenant-law workspace.
  id: '00000000-0000-0000-0000-000000000010',
  name: 'LeaseLens — NJ Tenant Law',
  description:
    'A NJ residential lease red-flag reviewer grounded in the NJ Truth-in-Renting Act, NJ Stat 46:8, and curated tenant-rights references.',
} as const;

/**
 * Sprint 24.3 — second sample workspace seeded with a deliberately
 * NJ-compliant residential lease (1.5-month security deposit, 5%
 * statutory late fee with grace period, reciprocal attorneys fees,
 * preserved warranty of habitability, etc.). Used to exercise the
 * "graded but clean" UI state — the original sample is HIGH-flag-heavy
 * by design, so without this second workspace there's no way to see
 * what the rail + cockpit SeverityDistribution look like when the
 * agent grades most clauses as OK.
 *
 * Same shape as SAMPLE_WORKSPACE so the workspace-cookie and middleware
 * paths treat it identically; `is_sample = 1` so the TTL cleanup never
 * touches it.
 */
export const SAMPLE_CLEAN_WORKSPACE = {
  id: '00000000-0000-0000-0000-000000000011',
  name: 'LeaseLens — NJ Clean Sample',
  description:
    'A deliberately NJ-compliant residential lease used to exercise the "no red flags" path: 1.5-month security deposit, 5% statutory late fee, reciprocal attorneys fees, preserved warranty of habitability, retaliation protection.',
} as const;

export const WORKSPACE_TTL_SECONDS = 60 * 60 * 24; // 24h
