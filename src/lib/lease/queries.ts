// Sprint 13 §3c — DB CRUD for leases / clauses + the
// conversations.active_lease_id pointer. Every query is workspace-
// scoped per agent-guidelines §2.
//
// Issue #29 — async: every helper awaits its statement against the async
// `Db` driver. `get<T>` returns `Promise<T | undefined>` so "not found" is
// handled explicitly at each call site. SQL text and placeholders are
// unchanged; only the call mechanics move from better-sqlite3 to @libsql.

import { randomUUID } from 'node:crypto';
import type { Db, DbHandle } from '@/lib/db/client';
import type { ClauseType } from './classify-clause';

export interface LeaseRow {
  id: string;
  workspace_id: string;
  filename: string;
  text_extract: string;
  page_count: number;
  uploaded_by: string;
  created_at: number;
}

export interface ClauseRow {
  id: string;
  lease_id: string;
  workspace_id: string;
  clause_index: number;
  clause_type: ClauseType;
  text: string;
  page_number: number;
  // Sprint 24.1 + Sprint 45 — grading persisted in-place on the clause row;
  // all NULL until grade_clause_severity has graded it (graded_at is the
  // "has been graded" sentinel). `SELECT *` returns these for every clause.
  severity: 'high' | 'medium' | 'low' | 'ok' | null;
  statute_citation: string | null;
  chunk_id: string | null;
  reasoning: string | null;
  recommended_action: string | null;
  graded_at: number | null;
  created_at: number;
}

export interface InsertLeaseInput {
  workspaceId: string;
  filename: string;
  textExtract: string;
  pageCount: number;
  uploadedBy: string;
}

export interface InsertClauseInput {
  leaseId: string;
  workspaceId: string;
  clauseIndex: number;
  clauseType: ClauseType;
  text: string;
  pageNumber: number;
}

export async function insertLease(
  db: DbHandle,
  input: InsertLeaseInput,
): Promise<string> {
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.workspaceId,
      input.filename,
      input.textExtract,
      input.pageCount,
      input.uploadedBy,
      Math.floor(Date.now() / 1000),
    );
  return id;
}

export async function getLease(
  db: Db,
  leaseId: string,
  workspaceId: string,
): Promise<LeaseRow | undefined> {
  return await db
    .prepare('SELECT * FROM leases WHERE id = ? AND workspace_id = ?')
    .get<LeaseRow>(leaseId, workspaceId);
}

export async function insertClause(
  db: DbHandle,
  input: InsertClauseInput,
): Promise<string> {
  const id = randomUUID();
  await db
    .prepare(
      `INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.leaseId,
      input.workspaceId,
      input.clauseIndex,
      input.clauseType,
      input.text,
      input.pageNumber,
      Math.floor(Date.now() / 1000),
    );
  return id;
}

export async function listClauses(
  db: Db,
  leaseId: string,
  workspaceId: string,
): Promise<ClauseRow[]> {
  return await db
    .prepare(
      `SELECT * FROM clauses
       WHERE lease_id = ? AND workspace_id = ?
       ORDER BY clause_index ASC`,
    )
    .all<ClauseRow>(leaseId, workspaceId);
}

/**
 * Sprint 45 — the persisted grading for a clause, read straight from storage
 * (no model/corpus call). Powers `get_lease_findings` so the chat answers
 * finding questions without re-running the scan. Only graded clauses
 * (`graded_at IS NOT NULL`) are returned, ordered high-severity first.
 */
export interface StoredGrading {
  clause_id: string;
  clause_index: number;
  clause_type: ClauseType;
  page_number: number;
  severity: 'high' | 'medium' | 'low' | 'ok';
  statute_citation: string | null;
  chunk_id: string | null;
  reasoning: string | null;
  recommended_action: string | null;
}

// high→ok so findings come back pre-ranked (the model answers "highest-severity
// finding" from the top). Local copy — this server module must NOT import the
// client grading helper (src/components/lease/grading.ts carries Tailwind maps).
const SEVERITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  ok: 3,
};

export async function listGradings(
  db: Db,
  leaseId: string,
  workspaceId: string,
): Promise<StoredGrading[]> {
  const rows = await db
    .prepare(
      `SELECT id, clause_index, clause_type, page_number, severity,
              statute_citation, chunk_id, reasoning, recommended_action
         FROM clauses
        WHERE lease_id = ? AND workspace_id = ? AND graded_at IS NOT NULL`,
    )
    .all<{
      id: string;
      clause_index: number;
      clause_type: ClauseType;
      page_number: number;
      severity: 'high' | 'medium' | 'low' | 'ok';
      statute_citation: string | null;
      chunk_id: string | null;
      reasoning: string | null;
      recommended_action: string | null;
    }>(leaseId, workspaceId);
  return rows
    .map((r) => ({
      clause_id: r.id,
      clause_index: r.clause_index,
      clause_type: r.clause_type,
      page_number: r.page_number,
      severity: r.severity,
      statute_citation: r.statute_citation,
      chunk_id: r.chunk_id,
      reasoning: r.reasoning,
      recommended_action: r.recommended_action,
    }))
    .sort(
      (a, b) =>
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
        a.clause_index - b.clause_index,
    );
}

export async function getActiveLease(
  db: Db,
  conversationId: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT active_lease_id FROM conversations WHERE id = ?')
    .get<{ active_lease_id: string | null }>(conversationId);
  return row?.active_lease_id ?? null;
}

export async function setActiveLease(
  db: DbHandle,
  conversationId: string,
  leaseId: string | null,
): Promise<void> {
  await db
    .prepare(`UPDATE conversations SET active_lease_id = ? WHERE id = ?`)
    .run(leaseId, conversationId);
}

/**
 * Sprint 25 — server-side snapshot of the conversation's active lease for
 * use during SSR rehydration. Joins conversations → leases and counts
 * clauses so the home page can seed ChatStreamProvider with enough
 * metadata to render the PDF panel header and reattach affordance
 * without waiting on the client.
 *
 * Returns null when:
 *  - the conversation doesn't exist
 *  - no active lease has been bound (active_lease_id is NULL)
 *  - the referenced lease row has been deleted (workspace TTL purge)
 *
 * The shape matches `ActiveLeaseRef` minus `pdfUrl` — that's a client-only
 * Blob URL produced from either a fresh upload or the IndexedDB cache.
 */
export interface ActiveLeaseSnapshot {
  lease_id: string;
  filename: string;
  page_count: number;
  clause_count: number;
}

export async function getActiveLeaseSnapshot(
  db: Db,
  conversationId: string,
): Promise<ActiveLeaseSnapshot | null> {
  const row = await db
    .prepare(
      `SELECT l.id           AS lease_id,
              l.filename     AS filename,
              l.page_count   AS page_count,
              (SELECT COUNT(*) FROM clauses WHERE lease_id = l.id) AS clause_count
       FROM conversations c
       JOIN leases l ON l.id = c.active_lease_id
       WHERE c.id = ?`,
    )
    .get<{
      lease_id: string;
      filename: string;
      page_count: number;
      clause_count: number;
    }>(conversationId);
  return row ?? null;
}
