import Database from 'better-sqlite3';
import { DEMO_USERS } from '@/lib/auth/constants';
import { migrate } from '@/lib/db/migrate';
import { SCHEMA } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { ingestCorpus } from '@/lib/rag/ingest';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';

export { DEMO_USERS };

export function runSeed(db: Database.Database) {
  // Initialize schema + apply Sprint 11 migrations.
  db.exec(SCHEMA);
  migrate(db);

  const now = Math.floor(Date.now() / 1000);

  // Sample workspace seeds first — every per-data row references it.
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
     VALUES (?, ?, ?, 1, ?, NULL)`,
  ).run(
    SAMPLE_WORKSPACE.id,
    SAMPLE_WORKSPACE.name,
    SAMPLE_WORKSPACE.description,
    now,
  );

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, email, role, display_name, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const user of DEMO_USERS) {
    insertUser.run(user.id, user.email, user.role, user.display_name, now);
  }
}

// Execute if run directly
if (require.main === module) {
  (async () => {
    const seedDb = new Database(env.CONTENTOPS_DB_PATH);
    console.log('Seeding database...');
    try {
      runSeed(seedDb);
      await ingestCorpus(seedDb);
      console.log('Database seeding complete.');
    } catch (error) {
      console.error('Seeding failed:', error);
      process.exit(1);
    } finally {
      seedDb.close();
    }
  })();
}
