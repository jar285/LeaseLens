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
import {
  SAMPLE_CLEAN_WORKSPACE,
  SAMPLE_WORKSPACE,
} from '@/lib/workspaces/constants';

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

// Sprint 24.3 — clean (NJ-compliant) sample lease lives alongside the
// PDF version as a markdown source. There's no PDF for the clean
// variant by design: PDF rendering would require an extra build-time
// dependency and the seed-time ingest path doesn't need pdfjs once
// the text is already available. The markdown's numbered clauses are
// piped through the existing `segmentClauses` regex, so the resulting
// clause rows have the same shape as a real PDF upload would produce.
const SAMPLE_CLEAN_LEASE_MD_PATH = join(
  process.cwd(),
  'src',
  'corpus',
  'sample-lease',
  'sample-nj-clean-lease.md',
);

// Sprint 13 — stable id for the seeded sample lease so the lease-
// grading eval (Phase 11) can reference it without re-seeding.
export const SAMPLE_LEASE_ID = '00000000-0000-0000-0000-000000000020';
// Sprint 24.3 — stable id for the clean (no-red-flags) sample lease.
export const SAMPLE_CLEAN_LEASE_ID = '00000000-0000-0000-0000-000000000021';
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

  // Sprint 24.3 — second sample workspace for the clean (NJ-compliant)
  // lease. Same is_sample=1 + NULL expires_at so the TTL cleanup never
  // touches it.
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
     VALUES (?, ?, ?, 1, ?, NULL)`,
  ).run(
    SAMPLE_CLEAN_WORKSPACE.id,
    SAMPLE_CLEAN_WORKSPACE.name,
    SAMPLE_CLEAN_WORKSPACE.description,
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

/**
 * Sprint 24.3 — ingest the clean (NJ-compliant) sample lease directly
 * from its markdown source. No PDF round-trip required: the markdown
 * already carries the numbered-clause format that `segmentClauses`
 * recognises, so the resulting `clauses` rows have the same shape as
 * a real PDF upload would produce.
 *
 * Idempotent under the same pattern as `ingestSampleLease`: FK chain
 * deleted children-first (negotiation_emails → clauses → leases) and
 * the lease row gets reinserted with the stable SAMPLE_CLEAN_LEASE_ID
 * so the workspace switcher + eval references remain valid across
 * re-seeds.
 */
export async function ingestCleanSampleLease(
  db: Database.Database,
): Promise<void> {
  db.prepare(
    `DELETE FROM negotiation_emails WHERE clause_id IN (
       SELECT id FROM clauses WHERE lease_id = ?
     )`,
  ).run(SAMPLE_CLEAN_LEASE_ID);
  db.prepare('DELETE FROM clauses WHERE lease_id = ?').run(
    SAMPLE_CLEAN_LEASE_ID,
  );
  db.prepare('DELETE FROM leases WHERE id = ?').run(SAMPLE_CLEAN_LEASE_ID);

  const markdown = readFileSync(SAMPLE_CLEAN_LEASE_MD_PATH, 'utf-8');
  // The markdown contains a preamble, 15 numbered clauses, and a
  // signature block. `segmentClauses` operates on `PageText[]`; we
  // pass the whole document as a single page (pageNumber=1) since the
  // clean lease isn't paginated and the segmenter only needs newline-
  // anchored numeric prefixes to find sections.
  const segmented = segmentClauses([{ pageNumber: 1, text: markdown }]);

  // Use insertLease for the workspace-scoped contract, then overwrite
  // the auto-generated id with the stable SAMPLE_CLEAN_LEASE_ID.
  const tempId = insertLease(db, {
    workspaceId: SAMPLE_CLEAN_WORKSPACE.id,
    filename: 'sample-nj-clean-lease.pdf',
    textExtract: markdown,
    pageCount: 1,
    uploadedBy: SAMPLE_LEASE_UPLOADER_ID,
  });
  db.prepare('UPDATE leases SET id = ? WHERE id = ?').run(
    SAMPLE_CLEAN_LEASE_ID,
    tempId,
  );

  for (const seg of segmented) {
    insertClause(db, {
      leaseId: SAMPLE_CLEAN_LEASE_ID,
      workspaceId: SAMPLE_CLEAN_WORKSPACE.id,
      clauseIndex: seg.clauseIndex,
      clauseType: seg.clauseType,
      text: seg.text,
      pageNumber: seg.pageNumber,
    });
  }

  console.log(
    `clean sample lease: ${segmented.length} clauses ingested into workspace ${SAMPLE_CLEAN_WORKSPACE.id}`,
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
      await ingestCleanSampleLease(seedDb);
      console.log('Database seeding complete.');
    } catch (error) {
      console.error('Seeding failed:', error);
      process.exit(1);
    } finally {
      seedDb.close();
    }
  })();
}
