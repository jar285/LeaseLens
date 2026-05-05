/**
 * Sprint 11 — Workspaces & Brand Onboarding.
 *
 * The sample workspace is the default one-click path on the landing page.
 * Its UUID is stable across boots so existing per-data tables (audit_log,
 * documents, etc.) can default-backfill to it during the migration step.
 * Spec §4.2.
 */

export const SAMPLE_WORKSPACE = {
  id: '00000000-0000-0000-0000-000000000010',
  name: 'Side Quest Syndicate',
  description:
    'A gaming content brand for players who treat every session as an adventure worth talking about.',
} as const;

export const WORKSPACE_TTL_SECONDS = 60 * 60 * 24; // 24h
