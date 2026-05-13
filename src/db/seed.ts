import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { DEMO_USERS } from '@/lib/auth/constants';
import { toDbRole } from '@/lib/auth/role-codec';
import { migrate } from '@/lib/db/migrate';
import { SCHEMA } from '@/lib/db/schema';
import { env } from '@/lib/env';
import { parsePdf } from '@/lib/lease/parse-pdf';
import { insertClause, insertLease } from '@/lib/lease/queries';
import { segmentClauses } from '@/lib/lease/segment-clauses';
import { ingestCorpus } from '@/lib/rag/ingest';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';

export { DEMO_USERS };

// Sprint 13 §3d — corpus moved into a subdirectory so the LeaseLens
// NJ tenant-law set is isolated from any future corpora (e.g., NY
// add-on in a follow-up sprint).
const NJ_CORPUS_DIR = join(process.cwd(), 'src', 'corpus', 'nj-tenant-law');
const SAMPLE_LEASE_PDF_PATH = join(
  process.cwd(),
  'src',
  'corpus',
  'sample-lease',
  'sample-nj-residential-lease.pdf',
);

// Sprint 13 — stable id for the seeded sample lease so the lease-
// grading eval (Phase 11) can reference it without re-seeding.
export const SAMPLE_LEASE_ID = '00000000-0000-0000-0000-000000000020';
// Stable uploader so audit ownership tests are deterministic.
const SAMPLE_LEASE_UPLOADER_ID = DEMO_USERS.find((u) => u.role === 'Tenant')
  ?.id as string;

export function runSeed(db: Database.Database) {
  // Initialize schema + apply Sprint 11/13 migrations.
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
    // DB persists wire literals (Creator/Editor/Admin); translate at the
    // boundary so the application code can keep speaking Tenant/Reviewer.
    insertUser.run(
      user.id,
      user.email,
      toDbRole(user.role),
      user.display_name,
      now,
    );
  }
}

/**
 * Sprint 13 §3d — ingest the seeded sample NJ residential lease into
 * the new `leases` and `clauses` tables. Idempotent: if a lease row
 * with SAMPLE_LEASE_ID already exists, it is replaced along with its
 * clauses. The fixed id lets the lease-grading eval (Phase 11) point
 * at this lease without re-seeding.
 */
export async function ingestSampleLease(db: Database.Database): Promise<void> {
  // Idempotency: drop any existing rows for the fixed sample lease id.
  // FK chain (negotiation_emails ← clauses ← leases) — children first.
  db.prepare(
    `DELETE FROM negotiation_emails WHERE clause_id IN (
       SELECT id FROM clauses WHERE lease_id = ?
     )`,
  ).run(SAMPLE_LEASE_ID);
  db.prepare('DELETE FROM clauses WHERE lease_id = ?').run(SAMPLE_LEASE_ID);
  db.prepare('DELETE FROM leases WHERE id = ?').run(SAMPLE_LEASE_ID);

  const pdfBuffer = readFileSync(SAMPLE_LEASE_PDF_PATH);
  const parsed = await parsePdf(new Uint8Array(pdfBuffer));
  const segmented = segmentClauses(parsed.pages);

  // Use insertLease to keep the workspace-scoped contract, then
  // overwrite the auto-generated id with SAMPLE_LEASE_ID for stability.
  // Cleaner alternative would be to extend insertLease with a forceId
  // param; deferred to Phase 6 if needed.
  const tempId = insertLease(db, {
    workspaceId: SAMPLE_WORKSPACE.id,
    filename: 'sample-nj-residential-lease.pdf',
    textExtract: parsed.pages.map((p) => p.text).join('\n\n'),
    pageCount: parsed.pageCount,
    uploadedBy: SAMPLE_LEASE_UPLOADER_ID,
  });
  db.prepare('UPDATE leases SET id = ? WHERE id = ?').run(
    SAMPLE_LEASE_ID,
    tempId,
  );

  for (const seg of segmented) {
    insertClause(db, {
      leaseId: SAMPLE_LEASE_ID,
      workspaceId: SAMPLE_WORKSPACE.id,
      clauseIndex: seg.clauseIndex,
      clauseType: seg.clauseType,
      text: seg.text,
      pageNumber: seg.pageNumber,
    });
  }

  console.log(
    `sample lease: ${parsed.pageCount} pages, ${segmented.length} clauses ingested`,
  );
}

// Execute if run directly
if (require.main === module) {
  (async () => {
    mkdirSync(dirname(env.LEASELENS_DB_PATH), { recursive: true });
    const seedDb = new Database(env.LEASELENS_DB_PATH);
    console.log('Seeding database...');
    try {
      runSeed(seedDb);
      await ingestCorpus(seedDb, NJ_CORPUS_DIR);
      await ingestSampleLease(seedDb);
      console.log('Database seeding complete.');
    } catch (error) {
      console.error('Seeding failed:', error);
      process.exit(1);
    } finally {
      seedDb.close();
    }
  })();
}
