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
    title TEXT DEFAULT 'New Conversation',
    created_at INTEGER NOT NULL
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

  CREATE TABLE IF NOT EXISTS documents (
    id           TEXT PRIMARY KEY,
    slug         TEXT UNIQUE NOT NULL,
    title        TEXT NOT NULL,
    content      TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id              TEXT PRIMARY KEY,
    document_id     TEXT NOT NULL REFERENCES documents(id),
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
    input_json               TEXT NOT NULL,
    output_json              TEXT NOT NULL,
    compensating_action_json TEXT NOT NULL,
    status                   TEXT NOT NULL CHECK(status IN ('executed', 'rolled_back')) DEFAULT 'executed',
    created_at               INTEGER NOT NULL,
    rolled_back_at           INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON audit_log(actor_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

  CREATE TABLE IF NOT EXISTS content_calendar (
    id            TEXT PRIMARY KEY,
    document_slug TEXT NOT NULL,
    scheduled_for INTEGER NOT NULL,
    channel       TEXT NOT NULL,
    scheduled_by  TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id            TEXT PRIMARY KEY,
    document_slug TEXT NOT NULL,
    approved_by   TEXT NOT NULL,
    notes         TEXT,
    created_at    INTEGER NOT NULL
  );
`;
