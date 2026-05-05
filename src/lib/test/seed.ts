/**
 * Shared seed helpers for tests. Implementations match the pre-Sprint-8
 * locally-defined helpers in src/lib/rag/retrieve.test.ts and
 * src/lib/evals/runner.test.ts byte-for-byte (cite-and-copy per
 * sprint plan Task 2 / sprint-qa M2). Characterization-diff verifies preservation.
 *
 * Newly added in Sprint 8 for mutating-tool tests:
 *   - seedUser (default Creator role)
 *   - seedConversation
 */

import type Database from 'better-sqlite3';
import { DEMO_USERS } from '@/lib/auth/constants';
import type { Role } from '@/lib/auth/types';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { mockEmbedding } from './embed-mock';

/**
 * Inserts a documents row scoped to a workspace. Default workspace is
 * SAMPLE_WORKSPACE.id so existing test sites work without code changes
 * (Sprint 11 sweep — sprint-QA H3 / Task 23).
 */
export function seedDocument(
  db: Database.Database,
  slug: string,
  workspaceId: string = SAMPLE_WORKSPACE.id,
): string {
  const docId = `doc-${slug}-${workspaceId.slice(-6)}`;
  db.prepare(
    `INSERT INTO documents (id, slug, workspace_id, title, content, content_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(docId, slug, workspaceId, slug, 'full doc content', 'hash', Date.now());
  return docId;
}

/**
 * Inserts a chunks row. Default workspace is SAMPLE_WORKSPACE.id; pass
 * `overrides.workspaceId` for cross-workspace fixtures.
 */
export function seedChunk(
  db: Database.Database,
  docId: string,
  overrides: {
    id: string;
    content: string;
    level?: 'document' | 'section' | 'passage';
    heading?: string | null;
    index?: number;
    workspaceId?: string;
  },
): void {
  const level = overrides.level ?? 'section';
  const heading = overrides.heading ?? null;
  const chunkIndex = overrides.index ?? 0;
  const workspaceId = overrides.workspaceId ?? SAMPLE_WORKSPACE.id;
  const embedding = mockEmbedding(overrides.content);

  db.prepare(
    `INSERT INTO chunks (id, document_id, workspace_id, chunk_index, chunk_level, heading, content, embedding, embedding_model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    overrides.id,
    docId,
    workspaceId,
    chunkIndex,
    level,
    heading,
    overrides.content,
    embedding,
    'all-MiniLM-L6-v2',
    Date.now(),
  );
}

/**
 * Inserts the demo user matching the requested role. Uses the stable
 * DEMO_USERS UUIDs from src/lib/auth/constants.ts so audit-row
 * actor_user_id values are predictable across tests. Idempotent
 * (INSERT OR IGNORE) so repeated calls are safe.
 */
export function seedUser(
  db: Database.Database,
  role: Role = 'Creator',
): { id: string; email: string; role: Role; display_name: string } {
  const user = DEMO_USERS.find((u) => u.role === role);
  if (!user) throw new Error(`No demo user with role ${role}`);
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT OR IGNORE INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(user.id, user.email, user.role, user.display_name, now);
  return user;
}

/**
 * Inserts a conversations row owned by `userId`.
 * Equivalent to the inline INSERT in src/app/api/chat/route.integration.test.ts.
 */
export function seedConversation(
  db: Database.Database,
  userId: string,
  id = 'conv-test',
  title = 'Test Conversation',
): string {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    'INSERT INTO conversations (id, user_id, title, created_at) VALUES (?, ?, ?, ?)',
  ).run(id, userId, title, now);
  return id;
}
