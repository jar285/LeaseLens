// Sprint 13 §3c — DB CRUD for leases / clauses + the
// conversations.active_lease_id pointer. Every query is workspace-
// scoped per agent-guidelines §2.

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
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

export function insertLease(
  db: Database.Database,
  input: InsertLeaseInput,
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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

export function getLease(
  db: Database.Database,
  leaseId: string,
  workspaceId: string,
): LeaseRow | undefined {
  return db
    .prepare('SELECT * FROM leases WHERE id = ? AND workspace_id = ?')
    .get(leaseId, workspaceId) as LeaseRow | undefined;
}

export function insertClause(
  db: Database.Database,
  input: InsertClauseInput,
): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO clauses (id, lease_id, workspace_id, clause_index, clause_type, text, page_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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

export function listClauses(
  db: Database.Database,
  leaseId: string,
  workspaceId: string,
): ClauseRow[] {
  return db
    .prepare(
      `SELECT * FROM clauses
       WHERE lease_id = ? AND workspace_id = ?
       ORDER BY clause_index ASC`,
    )
    .all(leaseId, workspaceId) as ClauseRow[];
}

export function getActiveLease(
  db: Database.Database,
  conversationId: string,
): string | null {
  const row = db
    .prepare('SELECT active_lease_id FROM conversations WHERE id = ?')
    .get(conversationId) as { active_lease_id: string | null } | undefined;
  return row?.active_lease_id ?? null;
}

export function setActiveLease(
  db: Database.Database,
  conversationId: string,
  leaseId: string | null,
): void {
  db.prepare(`UPDATE conversations SET active_lease_id = ? WHERE id = ?`).run(
    leaseId,
    conversationId,
  );
}
