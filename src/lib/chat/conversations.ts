import type { Db } from '@/lib/db/client';

/**
 * Returns the most recent conversation for a (user, workspace) pair, or
 * null when none exists. Round 3 — replaces the inline page.tsx query
 * that filtered only by user_id, which caused cross-workspace conversation
 * bleed when a user switched workspaces.
 *
 * Spec §20.
 *
 * Issue #29 — async: awaits the SELECT against the async `Db` handle.
 */
export async function getLatestConversationForWorkspace(
  db: Db,
  opts: { userId: string; workspaceId: string },
): Promise<{ id: string } | null> {
  const row = await db
    .prepare(
      `SELECT id FROM conversations
       WHERE user_id = ? AND workspace_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get<{ id: string }>(opts.userId, opts.workspaceId);
  return row ?? null;
}
