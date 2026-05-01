import Database from 'better-sqlite3';
import { SCHEMA } from '@/lib/db/schema';

/**
 * Creates a fresh in-memory database with the current schema.
 * Useful for unit and integration tests to avoid side effects.
 *
 * Sprint 8: moved from src/lib/db/test-helpers.ts to consolidate
 * test infrastructure under src/lib/test/.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(SCHEMA);
  return db;
}
