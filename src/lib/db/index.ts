import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { env } from '@/lib/env';
import { migrate } from './migrate';
import { SCHEMA } from './schema';

if (!env.CONTENTOPS_DEMO_MODE) {
  mkdirSync(dirname(env.CONTENTOPS_DB_PATH), { recursive: true });
}

const db = new Database(env.CONTENTOPS_DB_PATH);

db.pragma('busy_timeout = 5000');
db.pragma('journal_mode = WAL');
// Lock FK enforcement explicitly — schema declares REFERENCES clauses that
// require this pragma. Don't rely on the library default.
db.pragma('foreign_keys = ON');
db.exec(SCHEMA);
migrate(db); // Sprint 11 — patches pre-Sprint-11 dev DBs idempotently.

export { db };
