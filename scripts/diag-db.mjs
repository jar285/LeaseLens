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

console.log('\n=== document row count ===');
console.log(db.prepare('SELECT COUNT(*) as c FROM documents').get());

console.log('\n=== distinct workspace_ids in documents ===');
try {
  console.log(db.prepare('SELECT DISTINCT workspace_id FROM documents').all());
} catch (e) {
  console.log('  (workspace_id column missing:', e.message, ')');
}

console.log('\n=== workspaces ===');
try {
  console.log(db.prepare('SELECT id, name, is_sample FROM workspaces').all());
} catch (e) {
  console.log('  (workspaces table missing:', e.message, ')');
}

console.log('\n=== foreign_keys pragma ===');
console.log('foreign_keys =', db.pragma('foreign_keys', { simple: true }));

db.close();
