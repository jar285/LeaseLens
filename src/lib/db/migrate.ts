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
 * Sprint 24.1 — helper for table-presence checks. Lets migrations that
 * touch a table created in a later sprint skip cleanly when run against
 * a pre-existing-sprint fixture (the migrate.test.ts fixtures construct
 * partial schemas to test column-addition paths). New DBs always have
 * every table from SCHEMA, so this returns true in production.
 */
function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { name: string } | undefined;
  return row !== undefined;
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
/**
 * Sprint D.20 (#20) — does `table` already declare an FK from `fromColumn`?
 * Guards the FK-adding rebuilds below so they fire once per DB (fresh DBs get
 * the FKs straight from SCHEMA and skip the rebuild entirely).
 */
function fkExists(
  db: Database.Database,
  table: string,
  fromColumn: string,
): boolean {
  const fks = db.prepare(`PRAGMA foreign_key_list(${table})`).all() as {
    from: string;
  }[];
  return fks.some((f) => f.from === fromColumn);
}

/**
 * Sprint D.20 (#20) — run an FK-adding 12-step table rebuild, tolerant of the
 * parallel-`next build` race (multiple workers open this same DB file; the
 * duplicate-column swallow doesn't map to DROP/RENAME, so instead: if the
 * rebuild throws but the FK now exists, another worker completed it first —
 * the desired end state — and the error is swallowed; anything else rethrows).
 */
function rebuildWithFkRaceTolerance(
  db: Database.Database,
  table: string,
  guardColumn: string,
  rebuild: () => void,
): void {
  try {
    rebuild();
  } catch (err) {
    if (!fkExists(db, table, guardColumn)) throw err;
  }
}

/**
 * Sprint D.20 (#20) — rebuild `leases` adding the FK invariant net:
 * workspace_id → workspaces(id), uploaded_by → users(id). Bare FKs (no ON
 * DELETE — deletion stays the explicit children-first purge in
 * WORKSPACE_SCOPED_TABLES); they prevent orphan CREATION, so tenant PII can't
 * be stranded outside the retention sweep. Same pragma discipline as the
 * documents rebuild above (FK pragma toggled OUTSIDE the transaction).
 */
function rebuildLeasesTableWithFks(db: Database.Database): void {
  const fkWasOn = db.pragma('foreign_keys', { simple: true }) === 1;
  if (fkWasOn) db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE leases_new (
          id            TEXT PRIMARY KEY,
          workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
          filename      TEXT NOT NULL,
          text_extract  TEXT NOT NULL,
          page_count    INTEGER NOT NULL,
          uploaded_by   TEXT NOT NULL REFERENCES users(id),
          created_at    INTEGER NOT NULL
        );
        INSERT INTO leases_new (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
          SELECT id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at FROM leases;
        DROP TABLE leases;
        ALTER TABLE leases_new RENAME TO leases;
        CREATE INDEX IF NOT EXISTS idx_leases_workspace ON leases(workspace_id);
      `);
    })();
  } finally {
    if (fkWasOn) db.pragma('foreign_keys = ON');
  }
}

/**
 * Sprint D.20 (#20) — rebuild `tool_calls` adding workspace_id →
 * workspaces(id). actor_user_id deliberately gets NO FK: the MCP server
 * writes the synthetic actor 'mcp-server' (no users row), and observability
 * rows shouldn't couple to deletable parents. Must run AFTER the error_code
 * ADD COLUMN migration (the copy needs the modern column set).
 */
function rebuildToolCallsTableWithFks(db: Database.Database): void {
  const fkWasOn = db.pragma('foreign_keys', { simple: true }) === 1;
  if (fkWasOn) db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE tool_calls_new (
          id              TEXT PRIMARY KEY,
          tool_name       TEXT NOT NULL,
          tool_use_id     TEXT,
          actor_user_id   TEXT NOT NULL,
          actor_role      TEXT NOT NULL CHECK(actor_role IN ('Creator', 'Editor', 'Admin')),
          conversation_id TEXT,
          workspace_id    TEXT NOT NULL REFERENCES workspaces(id),
          status          TEXT NOT NULL CHECK(status IN ('success', 'error')) DEFAULT 'success',
          error_message   TEXT,
          error_code      TEXT,
          latency_ms      INTEGER,
          created_at      INTEGER NOT NULL
        );
        INSERT INTO tool_calls_new (id, tool_name, tool_use_id, actor_user_id, actor_role, conversation_id, workspace_id, status, error_message, error_code, latency_ms, created_at)
          SELECT id, tool_name, tool_use_id, actor_user_id, actor_role, conversation_id, workspace_id, status, error_message, error_code, latency_ms, created_at FROM tool_calls;
        DROP TABLE tool_calls;
        ALTER TABLE tool_calls_new RENAME TO tool_calls;
        CREATE INDEX IF NOT EXISTS idx_tool_calls_workspace ON tool_calls(workspace_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tool_calls_tool      ON tool_calls(tool_name, created_at DESC);
      `);
    })();
  } finally {
    if (fkWasOn) db.pragma('foreign_keys = ON');
  }
}

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

  // Sprint 13 §3e — conversations.active_lease_id (nullable). Idempotent
  // via columnExists so re-running the migrate path on a fresh SCHEMA-built
  // DB or an already-migrated dev DB is a no-op.
  if (!columnExists(db, 'conversations', 'active_lease_id')) {
    db.exec(`ALTER TABLE conversations ADD COLUMN active_lease_id TEXT`);
  }

  // Sprint 24.1 — clauses.severity (nullable, written by
  // grade_clause_severity after validation). Source of truth for the
  // cockpit SeverityDistribution panel. New DBs get the column with
  // the CHECK(severity IN ('high','medium','low','ok')) constraint
  // from SCHEMA; pre-Sprint-24 dev DBs get the column via ALTER
  // (SQLite ALTER TABLE ADD COLUMN doesn't accept CHECK inline). The
  // grading-tool validation + the TS Severity type at the application
  // boundary keep the value space identical between fresh and migrated
  // DBs, so the missing CHECK on migrated rows is cosmetic only.
  if (tableExists(db, 'clauses') && !columnExists(db, 'clauses', 'severity')) {
    db.exec(`ALTER TABLE clauses ADD COLUMN severity TEXT`);
  }

  // Sprint 44B — tool_calls.error_code (nullable, no CHECK → a clean ADD
  // COLUMN; idempotent via columnExists). Stores the enumerated failure code
  // alongside the now-PII-safe error_message (a bare error NAME). We do NOT
  // add a 'failed' status to audit_log: its status CHECK would force a full
  // table rebuild, and tool_calls already records every failure.
  if (
    tableExists(db, 'tool_calls') &&
    !columnExists(db, 'tool_calls', 'error_code')
  ) {
    try {
      db.exec(`ALTER TABLE tool_calls ADD COLUMN error_code TEXT`);
    } catch (err) {
      // `next build` runs page-data collection across parallel workers, each
      // opening this same DB file. For a brand-new column they can all pass the
      // columnExists check and then race the ADD; the losers throw
      // "duplicate column name". The column existing is the desired end state,
      // so swallow only that error and rethrow anything else.
      if (
        !(err instanceof Error && /duplicate column name/i.test(err.message))
      ) {
        throw err;
      }
    }
  }

  // Sprint 45 — persist the FULL grading on `clauses` (not just severity) so
  // the chat reads findings via get_lease_findings WITHOUT re-running the scan
  // (reasoning/citation otherwise live only in trimmed conversation history).
  // Five nullable columns, no CHECK → clean ADD COLUMNs; idempotent via
  // columnExists; race-tolerant for parallel `next build` workers (Sprint 44B).
  if (tableExists(db, 'clauses')) {
    for (const [name, type] of [
      ['statute_citation', 'TEXT'],
      ['chunk_id', 'TEXT'],
      ['reasoning', 'TEXT'],
      ['recommended_action', 'TEXT'],
      ['graded_at', 'INTEGER'],
    ] as const) {
      if (columnExists(db, 'clauses', name)) continue;
      try {
        db.exec(`ALTER TABLE clauses ADD COLUMN ${name} ${type}`);
      } catch (err) {
        if (
          !(err instanceof Error && /duplicate column name/i.test(err.message))
        ) {
          throw err;
        }
      }
    }

    // Sprint 45 — backfill graded_at for clauses graded by PRE-Sprint-45 code
    // (severity set, graded_at NULL). Without it those grades read as
    // "ungraded", so the chat needlessly re-scans an already-scanned lease (the
    // graded-count prompt branch + get_lease_findings both key off graded_at).
    // `severity` is the long-standing graded sentinel (Sprint 24.1), set by
    // every successful grade; created_at approximates the grade time. Idempotent
    // (matches 0 rows once backfilled; UPDATE is race-safe, no schema change).
    if (columnExists(db, 'clauses', 'graded_at')) {
      db.exec(
        `UPDATE clauses SET graded_at = created_at WHERE severity IS NOT NULL AND graded_at IS NULL`,
      );
    }
  }

  // Sprint D.20 (#20) — FK invariant net on the job-owned tables. Runs LAST so
  // the rebuilt copies carry every column added by the migrations above
  // (tool_calls.error_code). Fresh DBs get the FKs from SCHEMA (guard false);
  // legacy DBs rebuild once. Pre-existing orphan rows survive the copy (FK
  // pragma is OFF during the rebuild; SQLite enforces on new writes only) —
  // `PRAGMA foreign_key_check` is the ops tool for auditing legacy data.
  if (tableExists(db, 'leases') && !fkExists(db, 'leases', 'workspace_id')) {
    rebuildWithFkRaceTolerance(db, 'leases', 'workspace_id', () =>
      rebuildLeasesTableWithFks(db),
    );
  }
  if (
    tableExists(db, 'tool_calls') &&
    !fkExists(db, 'tool_calls', 'workspace_id')
  ) {
    rebuildWithFkRaceTolerance(db, 'tool_calls', 'workspace_id', () =>
      rebuildToolCallsTableWithFks(db),
    );
  }
}
