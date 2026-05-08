// Sprint 13 §3c — DB CRUD for the new leases / clauses tables, plus
// the conversation active-lease pointer. All queries are workspace-
// scoped (charter §5 + agent-guidelines §2 invariant).

import type Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  getActiveLease,
  getLease,
  insertClause,
  insertLease,
  listClauses,
  setActiveLease,
} from './queries';

const OTHER_WS = 'workspace-other';

function seedWorkspaces(db: Database.Database): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES (?, ?, ?, 1, ?)`,
  ).run(
    SAMPLE_WORKSPACE.id,
    SAMPLE_WORKSPACE.name,
    SAMPLE_WORKSPACE.description,
    now,
  );
  db.prepare(
    `INSERT INTO workspaces (id, name, description, is_sample, created_at) VALUES (?, 'Other', 'other', 0, ?)`,
  ).run(OTHER_WS, now);
}

function seedConversation(
  db: Database.Database,
  id: string,
  workspaceId: string,
): void {
  db.prepare(
    `INSERT INTO users (id, email, role, display_name, created_at)
     VALUES ('u-tenant', 'u@example.com', 'Creator', 'U', 1)
     ON CONFLICT(id) DO NOTHING`,
  ).run();
  db.prepare(
    `INSERT INTO conversations (id, user_id, workspace_id, title, created_at)
     VALUES (?, 'u-tenant', ?, 't', 1)`,
  ).run(id, workspaceId);
}

describe('lease queries', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedWorkspaces(db);
  });

  describe('insertLease + getLease', () => {
    it('inserts and reads a lease scoped to the workspace', () => {
      const id = insertLease(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        filename: 'sample.pdf',
        textExtract: 'extracted text body',
        pageCount: 5,
        uploadedBy: 'u-tenant',
      });
      expect(id).toBeTypeOf('string');

      const lease = getLease(db, id, SAMPLE_WORKSPACE.id);
      expect(lease).toBeDefined();
      expect(lease?.filename).toBe('sample.pdf');
      expect(lease?.page_count).toBe(5);
      expect(lease?.uploaded_by).toBe('u-tenant');
    });

    it('getLease returns undefined when the lease belongs to a different workspace', () => {
      const id = insertLease(db, {
        workspaceId: OTHER_WS,
        filename: 'other.pdf',
        textExtract: 'x',
        pageCount: 1,
        uploadedBy: 'u-tenant',
      });

      expect(getLease(db, id, SAMPLE_WORKSPACE.id)).toBeUndefined();
    });

    it('getLease returns undefined for a non-existent id', () => {
      expect(
        getLease(db, 'no-such-lease', SAMPLE_WORKSPACE.id),
      ).toBeUndefined();
    });
  });

  describe('insertClause + listClauses', () => {
    it('inserts clauses for a lease and lists them in clause-index order', () => {
      const leaseId = insertLease(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        filename: 'sample.pdf',
        textExtract: 'x',
        pageCount: 5,
        uploadedBy: 'u-tenant',
      });

      insertClause(db, {
        leaseId,
        workspaceId: SAMPLE_WORKSPACE.id,
        clauseIndex: 1,
        clauseType: 'late_fee',
        text: 'late fee text',
        pageNumber: 2,
      });
      insertClause(db, {
        leaseId,
        workspaceId: SAMPLE_WORKSPACE.id,
        clauseIndex: 0,
        clauseType: 'security_deposit',
        text: 'security deposit text',
        pageNumber: 1,
      });

      const clauses = listClauses(db, leaseId, SAMPLE_WORKSPACE.id);
      expect(clauses).toHaveLength(2);
      // Ordered by clause_index ascending.
      expect(clauses[0].clause_index).toBe(0);
      expect(clauses[0].clause_type).toBe('security_deposit');
      expect(clauses[1].clause_index).toBe(1);
      expect(clauses[1].clause_type).toBe('late_fee');
    });

    it('listClauses scopes by workspace — returns empty for foreign workspace', () => {
      const leaseId = insertLease(db, {
        workspaceId: OTHER_WS,
        filename: 'x.pdf',
        textExtract: 'x',
        pageCount: 1,
        uploadedBy: 'u-tenant',
      });
      insertClause(db, {
        leaseId,
        workspaceId: OTHER_WS,
        clauseIndex: 0,
        clauseType: 'late_fee',
        text: 't',
        pageNumber: 1,
      });

      expect(listClauses(db, leaseId, SAMPLE_WORKSPACE.id)).toEqual([]);
    });

    it('listClauses returns empty array for a lease with no clauses', () => {
      const leaseId = insertLease(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        filename: 'empty.pdf',
        textExtract: 'x',
        pageCount: 1,
        uploadedBy: 'u-tenant',
      });
      expect(listClauses(db, leaseId, SAMPLE_WORKSPACE.id)).toEqual([]);
    });
  });

  describe('setActiveLease + getActiveLease', () => {
    it('round-trips active_lease_id through the conversation row', () => {
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id);
      const leaseId = insertLease(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        filename: 's.pdf',
        textExtract: 'x',
        pageCount: 1,
        uploadedBy: 'u-tenant',
      });

      setActiveLease(db, 'conv-1', leaseId);
      expect(getActiveLease(db, 'conv-1')).toBe(leaseId);
    });

    it('getActiveLease returns null when conversation has no active lease', () => {
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id);
      expect(getActiveLease(db, 'conv-1')).toBeNull();
    });

    it('getActiveLease returns null for an unknown conversation id', () => {
      expect(getActiveLease(db, 'no-such-conv')).toBeNull();
    });

    it('setActiveLease can clear the pointer by passing null', () => {
      seedConversation(db, 'conv-1', SAMPLE_WORKSPACE.id);
      const leaseId = insertLease(db, {
        workspaceId: SAMPLE_WORKSPACE.id,
        filename: 's.pdf',
        textExtract: 'x',
        pageCount: 1,
        uploadedBy: 'u-tenant',
      });

      setActiveLease(db, 'conv-1', leaseId);
      setActiveLease(db, 'conv-1', null);
      expect(getActiveLease(db, 'conv-1')).toBeNull();
    });
  });
});
