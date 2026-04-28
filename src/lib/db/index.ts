import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { env } from '@/lib/env';
import { SCHEMA } from './schema';

if (!env.CONTENTOPS_DEMO_MODE) {
  mkdirSync(dirname(env.CONTENTOPS_DB_PATH), { recursive: true });
}

const db = new Database(env.CONTENTOPS_DB_PATH);

db.pragma('busy_timeout = 5000');
db.pragma('journal_mode = WAL');
db.exec(SCHEMA);

export { db };
