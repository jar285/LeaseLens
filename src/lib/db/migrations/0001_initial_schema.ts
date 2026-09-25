import type { Migration } from './types';

/**
 * Migration 0001 — initial schema (issue #29).
 *
 * This is the end-state schema previously produced by the combination of the
 * `SCHEMA` constant (`src/lib/db/schema.ts`, deleted in #29) plus the
 * idempotent boot-time patches in `src/lib/db/migrate.ts` (also deleted):
 * every per-data table already carries `workspace_id`, `clauses` carries the
 * full Sprint 45 grading columns, `tool_calls` carries `error_code`, the
 * Sprint D.20 FK invariant net is declared inline, and the workspace-scoped
 * indexes (previously created inside `migrate()`) are part of the file.
 *
 * Fresh databases (including a new hosted Turso database) get the complete
 * schema from this single migration. Pre-existing local dev databases created
 * by the old better-sqlite3 boot path are baseline-marked as already
 * migrated (see `runMigrations`) — they reached this same end state via the
 * old `SCHEMA` + `migrate()` path, so re-running DDL would be a no-op anyway.
 */
export const migration0001: Migration = {
  version: 1,
  name: 'initial_schema',
  up: `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Creator', 'Editor', 'Admin')),
    display_name TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    workspace_id TEXT NOT NULL,
    title TEXT DEFAULT 'New Conversation',
    created_at INTEGER NOT NULL,
    active_lease_id TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
    content TEXT NOT NULL,
    tokens_in INTEGER,
    tokens_out INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS spend_log (
    date TEXT PRIMARY KEY,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS provider_call (
    id             TEXT PRIMARY KEY,
    status         TEXT NOT NULL CHECK(status IN ('reserved', 'committed', 'released')) DEFAULT 'reserved',
    session_id     TEXT,
    estimated_in   INTEGER NOT NULL DEFAULT 0,
    estimated_out  INTEGER NOT NULL DEFAULT 0,
    estimated_cost REAL NOT NULL DEFAULT 0,
    actual_in      INTEGER,
    actual_out     INTEGER,
    date           TEXT NOT NULL,
    created_at     INTEGER NOT NULL,
    committed_at   INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_provider_call_date_status ON provider_call(date, status);

  CREATE TABLE IF NOT EXISTS rate_limit (
    session_id TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS quota_counter (
    quota_key    TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count        INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL,
    is_sample     INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    expires_at    INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_workspaces_expires ON workspaces(expires_at);

  CREATE TABLE IF NOT EXISTS documents (
    id           TEXT PRIMARY KEY,
    slug         TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    title        TEXT NOT NULL,
    content      TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id              TEXT PRIMARY KEY,
    document_id     TEXT NOT NULL REFERENCES documents(id),
    workspace_id    TEXT NOT NULL,
    chunk_index     INTEGER NOT NULL,
    chunk_level     TEXT NOT NULL CHECK(chunk_level IN ('document', 'section', 'passage')),
    heading         TEXT,
    content         TEXT NOT NULL,
    embedding       BLOB,
    embedding_model TEXT,
    created_at      INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id                       TEXT PRIMARY KEY,
    tool_name                TEXT NOT NULL,
    tool_use_id              TEXT,
    actor_user_id            TEXT NOT NULL,
    actor_role               TEXT NOT NULL CHECK(actor_role IN ('Creator', 'Editor', 'Admin')),
    conversation_id          TEXT,
    workspace_id             TEXT NOT NULL,
    input_json               TEXT NOT NULL,
    output_json              TEXT NOT NULL,
    compensating_action_json TEXT NOT NULL,
    status                   TEXT NOT NULL CHECK(status IN ('executed', 'rolled_back')) DEFAULT 'executed',
    created_at               INTEGER NOT NULL,
    rolled_back_at           INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON audit_log(actor_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

  CREATE TABLE IF NOT EXISTS tool_calls (
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

  CREATE INDEX IF NOT EXISTS idx_tool_calls_workspace ON tool_calls(workspace_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tool_calls_tool      ON tool_calls(tool_name, created_at DESC);

  CREATE TABLE IF NOT EXISTS content_calendar (
    id            TEXT PRIMARY KEY,
    document_slug TEXT NOT NULL,
    workspace_id  TEXT NOT NULL,
    scheduled_for INTEGER NOT NULL,
    channel       TEXT NOT NULL,
    scheduled_by  TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id            TEXT PRIMARY KEY,
    document_slug TEXT NOT NULL,
    workspace_id  TEXT NOT NULL,
    approved_by   TEXT NOT NULL,
    notes         TEXT,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS leases (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL REFERENCES workspaces(id),
    filename      TEXT NOT NULL,
    text_extract  TEXT NOT NULL,
    page_count    INTEGER NOT NULL,
    uploaded_by   TEXT NOT NULL REFERENCES users(id),
    created_at    INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_leases_workspace ON leases(workspace_id);

  CREATE TABLE IF NOT EXISTS clauses (
    id            TEXT PRIMARY KEY,
    lease_id      TEXT NOT NULL REFERENCES leases(id),
    workspace_id  TEXT NOT NULL,
    clause_index  INTEGER NOT NULL,
    clause_type   TEXT NOT NULL,
    text          TEXT NOT NULL,
    page_number   INTEGER NOT NULL,
    severity      TEXT CHECK(severity IN ('high', 'medium', 'low', 'ok')),
    statute_citation   TEXT,
    chunk_id           TEXT,
    reasoning          TEXT,
    recommended_action TEXT,
    graded_at          INTEGER,
    created_at    INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_clauses_lease     ON clauses(lease_id);
  CREATE INDEX IF NOT EXISTS idx_clauses_workspace ON clauses(workspace_id);

  CREATE TABLE IF NOT EXISTS negotiation_emails (
    id            TEXT PRIMARY KEY,
    clause_id     TEXT NOT NULL REFERENCES clauses(id),
    workspace_id  TEXT NOT NULL,
    tone          TEXT NOT NULL,
    subject       TEXT NOT NULL,
    body          TEXT NOT NULL,
    drafted_by    TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_negotiation_emails_workspace ON negotiation_emails(workspace_id);

  -- Workspace-scoped indexes. These lived in the old idempotent migrate()
  -- because they reference workspace_id, which pre-Sprint-11 dev DBs gained
  -- via ALTER TABLE. On a versioned-migration footing they are simply part
  -- of the initial schema.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_slug_workspace ON documents(slug, workspace_id);
  CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_workspace ON chunks(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON audit_log(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_content_calendar_workspace ON content_calendar(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_approvals_workspace ON approvals(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
  `,
};
