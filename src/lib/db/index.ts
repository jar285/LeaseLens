import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { env } from '@/lib/env';
import { logger } from '@/lib/log/logger';
import { migrate } from './migrate';
import { SCHEMA } from './schema';

if (!env.LEASELENS_DEMO_MODE) {
  mkdirSync(dirname(env.LEASELENS_DB_PATH), { recursive: true });
}

const db = new Database(env.LEASELENS_DB_PATH);

db.pragma('busy_timeout = 5000');
db.pragma('journal_mode = WAL');
// Lock FK enforcement explicitly — schema declares REFERENCES clauses that
// require this pragma. Don't rely on the library default.
db.pragma('foreign_keys = ON');
db.exec(SCHEMA);
migrate(db); // Sprint 11 — patches pre-Sprint-11 dev DBs idempotently.

// Phase 10.7 — startup sanity check. The NJ tenant-law corpus is the
// hard dependency for grade_clause_severity. If it's empty, the chat
// experience is broken in a way that's painful to diagnose from the
// UI alone (every grade fails). Log loud and clearly so the dev sees
// it in the terminal. The `predev` npm script auto-seeds when this
// is empty, so this warning should only appear if seeding was
// skipped or failed silently.
if (!env.LEASELENS_DEMO_MODE) {
  try {
    const row = db.prepare('SELECT COUNT(*) AS n FROM chunks').get() as
      | { n: number }
      | undefined;
    if ((row?.n ?? 0) === 0) {
      logger.warn(
        { hint: 'run `npm run db:seed`' },
        'db.corpus_empty: chunks table empty — NJ tenant-law corpus not loaded',
      );
    }
  } catch {
    // Table doesn't exist yet on a brand-new DB — schema/migrate
    // already ran above, but be defensive against unusual states.
  }
}

export { db };
