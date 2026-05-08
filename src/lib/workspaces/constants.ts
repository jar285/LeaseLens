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

export const WORKSPACE_TTL_SECONDS = 60 * 60 * 24; // 24h
