import Database from 'better-sqlite3';

const db = new Database('./data/contentops.db', { readonly: true });

console.log('=== documents table CREATE SQL ===');
const tableSql = db
  .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'")
  .get();
console.log(tableSql?.sql ?? '(no documents table)');

console.log('\n=== documents indexes (PRAGMA index_list) ===');
const indexes = db.prepare(`PRAGMA index_list(documents)`).all();
console.log(indexes);

console.log('\n=== columns covered by each index ===');
for (const idx of indexes) {
  const cols = db.prepare(`PRAGMA index_info(${idx.name})`).all();
  console.log(
    `  ${idx.name} (origin=${idx.origin}, unique=${idx.unique}): ${cols.map((c) => c.name).join(', ')}`,
  );
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
];
for (const t of TABLES) {
  try {
    const r = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get();
    console.log(`  ${t}: ${r.c}`);
  } catch (e) {
    console.log(`  ${t}: (missing — ${e.message})`);
  }
}

console.log('\n=== distinct workspace_ids in documents ===');
try {
  console.log(db.prepare('SELECT DISTINCT workspace_id FROM documents').all());
} catch (e) {
  console.log('  (workspace_id column missing:', e.message, ')');
}

console.log('\n=== workspaces ===');
try {
  console.log(
    db.prepare('SELECT id, name, is_sample, expires_at FROM workspaces').all(),
  );
} catch (e) {
  console.log('  (workspaces table missing:', e.message, ')');
}

console.log('\n=== foreign_keys pragma (current handle) ===');
console.log('foreign_keys =', db.pragma('foreign_keys', { simple: true }));

// FK orphan probes — these LEFT JOINs catch rows pointing at deleted parents.
// A non-zero count means PRAGMA foreign_keys=ON would fail at boot.
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
    'conversations.user_id → users.id',
    `SELECT COUNT(*) AS c FROM conversations cv
       LEFT JOIN users u ON cv.user_id = u.id
       WHERE u.id IS NULL`,
  ],
];
for (const [label, sql] of PROBES) {
  try {
    const r = db.prepare(sql).get();
    const status = r.c === 0 ? 'OK' : `ORPHANS=${r.c}`;
    console.log(`  ${label}: ${status}`);
  } catch (e) {
    console.log(`  ${label}: (probe failed — ${e.message})`);
  }
}

db.close();
