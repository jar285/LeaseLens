/**
 * Idempotent boot-time migration. Adds `workspace_id` to existing per-data
 * tables for dev DBs that pre-date Sprint 11. New DBs get the column from
 * the SCHEMA constant directly; this function is a no-op on those.
 *
 * Round 4 also drops the legacy column-level UNIQUE on documents.slug via
 * the SQLite 12-step table-rebuild procedure
 * (https://www.sqlite.org/lang_altertable.html#otheralter). Without this,
 * a dev DB carried over from before Sprint 11 still rejects cross-workspace
 * duplicate slugs. See spec §21.
 *
 * Spec §4.1, §20, §21.
 */

import type Database from 'better-sqlite3';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

function columnExists(
  db: Database.Database,
  table: string,
  column: string,
): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[];
  return cols.some((c) => c.name === column);
}

/**
 * Returns true when `documents` carries a column-level UNIQUE on `slug`
 * (origin='u' in PRAGMA index_list — a constraint, not a CREATE INDEX).
 * The composite UNIQUE on (slug, workspace_id) lives under origin='c' and
 * is correctly excluded.
 */
function hasLegacySlugUnique(db: Database.Database): boolean {
  const indexes = db
    .prepare(`PRAGMA index_list(documents)`)
    .all() as IndexListRow[];
  for (const idx of indexes) {
    if (!idx.unique || idx.origin !== 'u') continue;
    const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all() as {
      name: string;
    }[];
    if (cols.length === 1 && cols[0].name === 'slug') return true;
  }
  return false;
}

/**
 * Rebuilds the `documents` table without any column-level UNIQUE constraint,
 * preserving every row. The composite UNIQUE INDEX on (slug, workspace_id)
 * is re-created by the caller after this returns.
 *
 * SQLite's ALTER TABLE can't modify constraints; the 12-step rebuild is
 * the supported path. The procedure requires `PRAGMA foreign_keys = OFF`
 * around the rebuild because DROP TABLE on a referenced table fires FK
 * checks even though the new table has the same name and same row IDs.
 * The pragma must be set OUTSIDE the transaction — SQLite forbids changing
 * `foreign_keys` inside one. See https://www.sqlite.org/lang_altertable.html#otheralter
 */
function rebuildDocumentsTableWithoutSlugUnique(db: Database.Database): void {
  const fkWasOn = db.pragma('foreign_keys', { simple: true }) === 1;
  if (fkWasOn) db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE documents_new (
          id           TEXT PRIMARY KEY,
          slug         TEXT NOT NULL,
          workspace_id TEXT NOT NULL,
          title        TEXT NOT NULL,
          content      TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          created_at   INTEGER NOT NULL
        );
        INSERT INTO documents_new (id, slug, workspace_id, title, content, content_hash, created_at)
          SELECT id, slug, workspace_id, title, content, content_hash, created_at FROM documents;
        DROP TABLE documents;
        ALTER TABLE documents_new RENAME TO documents;
      `);
    })();
  } finally {
    if (fkWasOn) db.pragma('foreign_keys = ON');
  }
}

const TABLES_NEEDING_WORKSPACE = [
  'documents',
  'chunks',
  'audit_log',
  'content_calendar',
  'approvals',
  // Round 3: conversations is per-workspace too — chat history is intrinsically
  // tied to a brand context. See spec §20.
  'conversations',
] as const;

export function migrate(db: Database.Database): void {
  for (const table of TABLES_NEEDING_WORKSPACE) {
    if (!columnExists(db, table, 'workspace_id')) {
      // ADD COLUMN with DEFAULT is constant-time backfill in SQLite —
      // populates existing rows with the sample workspace UUID.
      db.exec(
        `ALTER TABLE ${table} ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '${SAMPLE_WORKSPACE.id}'`,
      );
    }
  }

  // Round 4 — drop the pre-Sprint-11 column-level UNIQUE on documents.slug
  // if present. Must run AFTER the ADD COLUMN loop so the rebuilt table can
  // SELECT workspace_id, and BEFORE index re-creation so the composite
  // UNIQUE attaches to the rebuilt table.
  if (hasLegacySlugUnique(db)) {
    rebuildDocumentsTableWithoutSlugUnique(db);
  }

  for (const table of TABLES_NEEDING_WORKSPACE) {
    // Always (re-)create the workspace_id index — idempotent, covers both
    // freshly-migrated DBs and brand-new DBs from SCHEMA.
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_${table}_workspace ON ${table}(workspace_id)`,
    );
  }

  // Composite UNIQUE on documents(slug, workspace_id) — replaces the
  // pre-Sprint-11 column-level UNIQUE on documents.slug. Always created
  // here (not in SCHEMA) so existing dev DBs get it after the column lands
  // and (Round 4) after the legacy UNIQUE has been rebuilt away.
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_slug_workspace ON documents(slug, workspace_id)`,
  );
}
