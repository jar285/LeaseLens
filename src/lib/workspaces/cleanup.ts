import type Database from 'better-sqlite3';

export interface PurgeResult {
  purged: number;
}

// Sprint A.7a (#7a) — every table that carries a `workspace_id` and is purged
// directly by it, in FK-safe (children-first) order. This list is the single
// source of truth for the cascade AND the coverage guard in cleanup.test.ts:
// a workspace_id table that's missing here (the exact bug #7a fixes —
// `tool_calls` was orphaning actor_user_id + tool I/O past workspace expiry)
// fails the enumeration test. Robert C. Martin: enforce the retention invariant
// in the data layer; Google SRE: retention must be mechanically reliable.
//
// FK chains within the list: negotiation_emails ← clauses ← leases, and
// chunks ← documents — so emails/clauses precede leases, and chunks precedes
// documents. `conversations` also has a workspace_id but is purged by its own
// statement below (its child `messages` has NO workspace_id and cascades off
// conversation_id first); `workspaces` is the parent, keyed by `id`.
export const WORKSPACE_SCOPED_TABLES = [
  'negotiation_emails',
  'clauses',
  'leases',
  'chunks',
  'audit_log',
  'tool_calls',
  'content_calendar',
  'approvals',
  'documents',
] as const;

/**
 * Lazy TTL cleanup. Runs in a single sync transaction:
 *   1. SELECT expired non-sample workspace ids.
 *   2. DELETE child rows in every workspace_id-scoped table
 *      (WORKSPACE_SCOPED_TABLES, FK-safe order) + conversations/messages.
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
    return purgeWorkspaceIds(
      db,
      expired.map((r) => r.id),
    );
  })();
}

/**
 * Sprint D.19 (#19) — delete ONE workspace by id regardless of expiry: the
 * engine behind the "Delete my review now" endpoint (Dieter Rams: if data is
 * temporary, storage must enforce it — including on demand, not only at the
 * TTL). Same invariants as the TTL purge: samples are NEVER deletable (the
 * shared demo data is not a visitor's to destroy), nonexistent ids are a
 * no-op, and the cascade is the shared FK-safe children-first sweep.
 */
export function purgeWorkspaceNow(
  db: Database.Database,
  workspaceId: string,
): PurgeResult {
  return db.transaction((): PurgeResult => {
    const row = db
      .prepare('SELECT id FROM workspaces WHERE id = ? AND is_sample = 0')
      .get(workspaceId) as { id: string } | undefined;
    if (!row) return { purged: 0 };
    return purgeWorkspaceIds(db, [row.id]);
  })();
}

/**
 * Sprint D.19 (#19) — the ONE cascade both purge paths share (extracted from
 * purgeExpiredWorkspaces so the #7a coverage guard + FK-order tests protect
 * the TTL sweep AND on-demand deletion identically). Caller owns the
 * transaction and the sample/expiry policy; this only deletes.
 */
function purgeWorkspaceIds(db: Database.Database, ids: string[]): PurgeResult {
  const placeholders = ids.map(() => '?').join(',');

  // Sprint 13 §3e / A.7a — children-first cascade over every workspace_id
  // table. With FK enforcement on (boot-time pragma), order matters; the
  // WORKSPACE_SCOPED_TABLES list is already in FK-safe order. Table names
  // come from a fixed const (never user input), so the interpolation is safe.
  for (const table of WORKSPACE_SCOPED_TABLES) {
    db.prepare(
      `DELETE FROM ${table} WHERE workspace_id IN (${placeholders})`,
    ).run(...ids);
  }
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
}
