import { createDbClient, type Db } from '@/lib/db/client';
import { runMigrations } from '@/lib/db/migrations';

/**
 * Creates a fresh in-memory database with the current schema.
 * Useful for unit and integration tests to avoid side effects.
 *
 * Sprint 8: moved from src/lib/db/test-helpers.ts to consolidate
 * test infrastructure under src/lib/test/.
 *
 * Issue #29 — async: builds the async Db handle on a `:memory:` libSQL
 * client and runs the real migration chain (never the module-level
 * `@/lib/db` singleton, never `@libsql/client` directly). Fresh migrated
 * in-memory DB per call.
 */
export async function createTestDb(): Promise<Db> {
  const db = createDbClient({ url: ':memory:' });
  await runMigrations(db);
  return db;
}
