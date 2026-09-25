#!/usr/bin/env node
// Dev diagnostic: prints schema + row counts + orphan probes for the
// configured database.
// Issue #29 — ported from better-sqlite3 to @libsql/client so it works
// against the local file DB (default) or the hosted Turso database when
// LEASELENS_TURSO_URL is set.

import { createClient } from '@libsql/client';

const tursoUrl = process.env.LEASELENS_TURSO_URL;
const dbPath = process.env.LEASELENS_DB_PATH || './data/leaselens.db';
const client = createClient(
  tursoUrl
    ? { url: tursoUrl, authToken: process.env.LEASELENS_TURSO_AUTH_TOKEN }
    : { url: dbPath === ':memory:' ? ':memory:' : `file:${dbPath}` },
);

console.log(
  `=== target: ${tursoUrl ? `turso ${tursoUrl}` : `file ${dbPath}`} ===`,
);

const get = async (sql, args = []) =>
  (await client.execute({ sql, args })).rows[0];
const all = async (sql, args = []) =>
  (await client.execute({ sql, args })).rows;

console.log('=== documents table CREATE SQL ===');
const tableSql = await get(
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'",
);
console.log(tableSql?.sql ?? '(no documents table)');

console.log('\n=== documents indexes (PRAGMA index_list) ===');
const indexes = await all(`PRAGMA index_list(documents)`);
console.log(indexes);

console.log('\n=== columns covered by each index ===');
for (const idx of indexes) {
  const cols = await all(`PRAGMA index_info(${idx.name})`);
  console.log(`${idx.name}:`, cols.map((c) => c.name).join(', '));
}

console.log('\n=== row counts ===');
const TABLES = [
  'workspaces',
  'users',
  'documents',
  'chunks',
  'conversations',
  'messages',
  'audit_log',
  'content_calendar',
  'approvals',
  'leases',
  'clauses',
];
for (const t of TABLES) {
  try {
    const r = await get(`SELECT COUNT(*) AS c FROM ${t}`);
    console.log(`  ${t}: ${r.c}`);
  } catch (e) {
    console.log(`  ${t}: (missing — ${e.message})`);
  }
}

console.log('\n=== distinct workspace_ids in documents ===');
try {
  console.log(await all('SELECT DISTINCT workspace_id FROM documents'));
} catch (e) {
  console.log('  (workspace_id column missing:', e.message, ')');
}

console.log('\n=== workspaces ===');
try {
  console.log(
    await all('SELECT id, name, is_sample, expires_at FROM workspaces'),
  );
} catch (e) {
  console.log('  (workspaces table missing:', e.message, ')');
}

// FK orphan probes — these LEFT JOINs catch rows pointing at deleted parents.
console.log('\n=== FK orphan probes ===');
const PROBES = [
  [
    'chunks.document_id → documents.id',
    `SELECT COUNT(*) AS c FROM chunks ch
       LEFT JOIN documents d ON ch.document_id = d.id
       WHERE d.id IS NULL`,
  ],
  [
    'messages.conversation_id → conversations.id',
    `SELECT COUNT(*) AS c FROM messages m
       LEFT JOIN conversations cv ON m.conversation_id = cv.id
       WHERE cv.id IS NULL`,
  ],
  [
    'clauses.lease_id → leases.id',
    `SELECT COUNT(*) AS c FROM clauses cl
       LEFT JOIN leases l ON cl.lease_id = l.id
       WHERE l.id IS NULL`,
  ],
  [
    'leases.workspace_id → workspaces.id',
    `SELECT COUNT(*) AS c FROM leases l
       LEFT JOIN workspaces w ON l.workspace_id = w.id
       WHERE w.id IS NULL`,
  ],
  [
    'tool_calls.workspace_id → workspaces.id',
    `SELECT COUNT(*) AS c FROM tool_calls tc
       LEFT JOIN workspaces w ON tc.workspace_id = w.id
       WHERE w.id IS NULL`,
  ],
  [
    'conversations.user_id → users.id',
    `SELECT COUNT(*) AS c FROM conversations cv
       LEFT JOIN users u ON cv.user_id = u.id
       WHERE u.id IS NULL`,
  ],
];
for (const [label, sql] of PROBES) {
  try {
    const r = await get(sql);
    const status = r.c === 0 ? 'OK' : `ORPHANS=${r.c}`;
    console.log(`  ${label}: ${status}`);
  } catch (e) {
    console.log(`  ${label}: (probe failed — ${e.message})`);
  }
}

client.close();
