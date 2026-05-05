import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { WORKSPACE_TTL_SECONDS } from './constants';
import type { Workspace } from './types';

export function getWorkspace(
  db: Database.Database,
  id: string,
): Workspace | null {
  return (
    (db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as
      | Workspace
      | undefined) ?? null
  );
}

/**
 * Returns the workspace iff it exists AND is active (sample OR not expired).
 * Read paths use this; bare `getWorkspace` is for cleanup-internal use only.
 *
 * Spec §4.13. Defines the cookie-vs-`expires_at` gray-state behavior:
 * an expired-but-not-yet-purged workspace is treated as not-present.
 */
export function getActiveWorkspace(
  db: Database.Database,
  id: string,
): Workspace | null {
  const ws = getWorkspace(db, id);
  if (!ws) return null;
  if (ws.is_sample === 1) return ws;
  if (ws.expires_at !== null && ws.expires_at > Math.floor(Date.now() / 1000)) {
    return ws;
  }
  return null;
}

export interface CreateWorkspaceInput {
  name: string;
  description: string;
}

export function createWorkspace(
  db: Database.Database,
  input: CreateWorkspaceInput,
): Workspace {
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expires_at = now + WORKSPACE_TTL_SECONDS;
  db.prepare(
    `INSERT INTO workspaces (id, name, description, is_sample, created_at, expires_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
  ).run(id, input.name, input.description, now, expires_at);
  return {
    id,
    name: input.name,
    description: input.description,
    is_sample: 0,
    created_at: now,
    expires_at,
  };
}

export function listExpiredWorkspaceIds(db: Database.Database): string[] {
  const rows = db
    .prepare(
      `SELECT id FROM workspaces
       WHERE is_sample = 0 AND expires_at IS NOT NULL AND expires_at < unixepoch()`,
    )
    .all() as { id: string }[];
  return rows.map((r) => r.id);
}
