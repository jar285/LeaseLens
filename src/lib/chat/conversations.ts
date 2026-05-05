import type Database from 'better-sqlite3';

/**
 * Returns the most recent conversation for a (user, workspace) pair, or
 * null when none exists. Round 3 — replaces the inline page.tsx query
 * that filtered only by user_id, which caused cross-workspace conversation
 * bleed when a user switched workspaces.
 *
 * Spec §20.
 */
export function getLatestConversationForWorkspace(
  db: Database.Database,
  opts: { userId: string; workspaceId: string },
): { id: string } | null {
  const row = db
    .prepare(
      `SELECT id FROM conversations
       WHERE user_id = ? AND workspace_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(opts.userId, opts.workspaceId) as { id: string } | undefined;
  return row ?? null;
}
