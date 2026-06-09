/**
 * Sprint 11 schema additions:
 *   - New `workspaces` table (sample + uploaded brand contexts).
 *   - `workspace_id` column on every per-data table (documents, chunks,
 *     audit_log, content_calendar, approvals).
 *   - Composite UNIQUE INDEX on (slug, workspace_id) in place of the
 *     old column-level UNIQUE on documents.slug — a slug like
 *     "brand-identity" must be allowed in multiple workspaces.
 *
 * Existing dev DBs are migrated by lib/db/migrate.ts on boot. New DBs
 * get the new shape directly from this SCHEMA constant.
 *
 * Spec §4.1, sprint-QA H1.
 */
export const SCHEMA = `
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

  CREATE TABLE IF NOT EXISTS rate_limit (
    session_id TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 0
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

  -- Sprint 24.5 — every tool invocation (read-only AND mutating) writes
  -- one row here. The existing audit_log table stays mutations-only
  -- with its Undo affordance; tool_calls is the broader observability
  -- log that powers the cockpit "What has the AI done?" panel and the
  -- per-tool stats. Joined to audit_log via tool_use_id when present
  -- so mutating rows can surface their Undo button by pulling the
  -- matching audit_id at read time.
  CREATE TABLE IF NOT EXISTS tool_calls (
    id              TEXT PRIMARY KEY,
    tool_name       TEXT NOT NULL,
    tool_use_id     TEXT,
    actor_user_id   TEXT NOT NULL,
    actor_role      TEXT NOT NULL CHECK(actor_role IN ('Creator', 'Editor', 'Admin')),
    conversation_id TEXT,
    workspace_id    TEXT NOT NULL,
    status          TEXT NOT NULL CHECK(status IN ('success', 'error')) DEFAULT 'success',
    -- Sprint 44B: error_message holds a SAFE error NAME (e.g. 'SyntaxError'),
    -- never the raw message (which can embed lease/draft PII); error_code is the
    -- enumerated failure code (parse_error | tool_error | access_denied | ...).
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

  -- Sprint 13 §3e — LeaseLens session-input tables. Per charter §5.12,
  -- leases are per-session input documents, NOT corpus content. They live
  -- in their own table and are NOT embedded into chunks.
  CREATE TABLE IF NOT EXISTS leases (
    id            TEXT PRIMARY KEY,
    workspace_id  TEXT NOT NULL,
    filename      TEXT NOT NULL,
    text_extract  TEXT NOT NULL,
    page_count    INTEGER NOT NULL,
    uploaded_by   TEXT NOT NULL,
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
    -- Sprint 24.1 — severity is written by grade_clause_severity after
    -- validation succeeds. NULL until the clause has been graded.
    -- Source of truth for the cockpit SeverityDistribution panel.
    severity      TEXT CHECK(severity IN ('high', 'medium', 'low', 'ok')),
    -- Sprint 45 — the rest of the grading persisted alongside severity so the
    -- chat can read findings via get_lease_findings WITHOUT re-running the scan
    -- (reasoning/citation otherwise live only in trimmed conversation history).
    -- All NULL until graded; graded_at is the "has been graded" sentinel.
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
`;
// Note: workspace_id-dependent indexes (composite UNIQUE on documents.slug,
// per-table workspace_id indexes) are created inside `migrate()` because they
// reference a column that may not yet exist when SCHEMA runs against a
// pre-Sprint-11 dev DB. migrate() runs after db.exec(SCHEMA) and is idempotent.
