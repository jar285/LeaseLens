import type Database from 'better-sqlite3';

export interface PurgeResult {
  purged: number;
}

/**
 * Lazy TTL cleanup. Runs in a single sync transaction:
 *   1. SELECT expired non-sample workspace ids.
 *   2. DELETE child rows in every per-data table (chunks, audit_log,
 *      content_calendar, approvals, documents).
 *   3. DELETE the workspaces themselves.
 *
 * Called from `POST /api/workspaces` immediately before the new INSERT.
 * No cron, no background job. Sample workspace (is_sample = 1) is never
 * touched even though its `expires_at` is NULL.
 *
 * Spec §4.5; sprint-QA M5.
 */
export function purgeExpiredWorkspaces(db: Database.Database): PurgeResult {
  return db.transaction((): PurgeResult => {
    const expired = db
      .prepare(
        `SELECT id FROM workspaces
         WHERE is_sample = 0 AND expires_at IS NOT NULL AND expires_at < unixepoch()`,
      )
      .all() as { id: string }[];
    if (expired.length === 0) return { purged: 0 };

    const ids = expired.map((r) => r.id);
    const placeholders = ids.map(() => '?').join(',');

    db.prepare(
      `DELETE FROM chunks WHERE workspace_id IN (${placeholders})`,
    ).run(...ids);
    db.prepare(
      `DELETE FROM audit_log WHERE workspace_id IN (${placeholders})`,
    ).run(...ids);
    db.prepare(
      `DELETE FROM content_calendar WHERE workspace_id IN (${placeholders})`,
    ).run(...ids);
    db.prepare(
      `DELETE FROM approvals WHERE workspace_id IN (${placeholders})`,
    ).run(...ids);
    db.prepare(
      `DELETE FROM documents WHERE workspace_id IN (${placeholders})`,
    ).run(...ids);
    // Round 3 — messages cascade through conversations.workspace_id, then
    // delete the conversations themselves. Order: children first.
    db.prepare(
      `DELETE FROM messages WHERE conversation_id IN (
         SELECT id FROM conversations WHERE workspace_id IN (${placeholders})
       )`,
    ).run(...ids);
    db.prepare(
      `DELETE FROM conversations WHERE workspace_id IN (${placeholders})`,
    ).run(...ids);
    db.prepare(`DELETE FROM workspaces WHERE id IN (${placeholders})`).run(
      ...ids,
    );

    return { purged: ids.length };
  })();
}
