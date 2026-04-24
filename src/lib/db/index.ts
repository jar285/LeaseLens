import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { env } from '@/lib/env';
import { SCHEMA } from './schema';

if (!env.CONTENTOPS_DEMO_MODE) {
  mkdirSync(dirname(env.CONTENTOPS_DB_PATH), { recursive: true });
}

const db = new Database(env.CONTENTOPS_DB_PATH, {
  readonly: env.CONTENTOPS_DEMO_MODE,
});

// Set a busy timeout to avoid "database is locked" errors during builds/concurrent access
db.pragma('busy_timeout = 5000');

// Enable WAL mode only in non-demo mode
if (!env.CONTENTOPS_DEMO_MODE) {
  db.pragma('journal_mode = WAL');
}

// Initialize schema only if we are in write mode (non-demo)
// CREATE TABLE IF NOT EXISTS is already idempotent, but executing it on
// every import during a read-only demo mode could fail.
if (!env.CONTENTOPS_DEMO_MODE) {
  db.exec(SCHEMA);
}

export { db };
