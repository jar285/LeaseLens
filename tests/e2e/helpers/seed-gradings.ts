// Sprint 25.2 — DB-seed a conversation with grading results visible.
//
// Why this exists: the E2E mock at src/lib/anthropic/e2e-mock.ts only emits
// extract_clauses (no grade_clause_severity follow-up), but most demo flows
// need visible red-flag cards. Seeding the messages table directly produces
// the exact same SSR rehydration path the user hits on every page load /
// role-switch / cockpit round-trip — testing through it exercises Sprint 25's
// rehydrateToolEvents path, not just rendering.
//
// Row shape mirrors what src/app/api/chat/route.ts:699-724 actually writes:
//   assistant row: { tool_use: { id, name, input } }
//   tool      row: { tool_result: { id, result } }

import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';

export interface SeedGrading {
  /** Stable clause_id the RedFlagReport dedupes/sorts by. */
  clauseId: string;
  severity: 'high' | 'medium' | 'low' | 'ok';
  /** Drives the citation chip + "View on page N" button. Optional. */
  pageNumber?: number;
  /** Drives the "Nº NN" plate prefix; index within the lease. */
  clauseIndex?: number;
  /** Renders inside the citation chip. */
  statuteCitation?: string;
  /** Renders as the clause-type pill in the card header. */
  clauseType?: string;
  /** Used by the chunk_id grounding check; any non-empty string is fine here. */
  chunkId?: string;
  reasoning?: string;
  recommendedAction?: string;
}

export interface SeedGradedConversationOptions {
  userId: string;
  workspaceId: string;
  /**
   * If provided, the conversation's active_lease_id is bound to this lease.
   * Pass undefined for tests that don't need the left-pane reattach path.
   */
  leaseId?: string;
  /**
   * Optional initial user message so the conversation has at least one
   * non-tool row in the transcript (matches what the chat route writes
   * first on every turn).
   */
  userMessageText?: string;
  gradings: SeedGrading[];
}

export interface SeededConversation {
  conversationId: string;
}

/**
 * Seeds a conversation with paired tool_use + tool_result rows for each
 * supplied grading. The page's SSR rehydration (rehydrateConversationMessages
 * + rehydrateToolEvents) renders them as red-flag cards on first paint.
 */
export function seedGradedConversation(
  opts: SeedGradedConversationOptions,
): SeededConversation {
  const conversationId = randomUUID();
  // Bump 1h into the future so seeded conversations win the page.tsx
  // ORDER BY created_at DESC LIMIT 1 over any conversation a prior test
  // (or the dev-server's chat route) may have created in the same wall-
  // clock second.
  const now = Math.floor(Date.now() / 1000) + 3600;

  const insertConv = db.prepare(
    `INSERT INTO conversations (id, user_id, workspace_id, title, created_at, active_lease_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertMessage = db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  db.transaction(() => {
    insertConv.run(
      conversationId,
      opts.userId,
      opts.workspaceId,
      'Seeded',
      now,
      opts.leaseId ?? null,
    );

    if (opts.userMessageText) {
      insertMessage.run(
        randomUUID(),
        conversationId,
        'user',
        opts.userMessageText,
        now,
      );
    }

    // One tool_use + tool_result pair per grading, named grade_clause_severity
    // so RedFlagReport's filter at RedFlagReport.tsx:65 matches.
    // created_at is offset per pair so ORDER BY created_at is deterministic.
    opts.gradings.forEach((g, i) => {
      const toolId = `toolu_seed_${conversationId.slice(0, 8)}_${i}`;
      const grading = {
        clause_id: g.clauseId,
        severity: g.severity,
        statute_citation: g.statuteCitation ?? 'NJ Stat 46:8-19',
        chunk_id: g.chunkId ?? 'security-deposit-cap#section:1',
        reasoning: g.reasoning ?? 'Seeded grading for E2E test.',
        recommended_action: g.recommendedAction ?? 'Seeded recommended action.',
        clause_type: g.clauseType ?? 'security_deposit',
        clause_index: g.clauseIndex ?? i,
        page_number: g.pageNumber,
      };
      const tsBase = now + i * 2;

      insertMessage.run(
        randomUUID(),
        conversationId,
        'assistant',
        JSON.stringify({
          tool_use: {
            id: toolId,
            name: 'grade_clause_severity',
            input: { clause_id: g.clauseId },
          },
        }),
        tsBase,
      );
      insertMessage.run(
        randomUUID(),
        conversationId,
        'tool',
        JSON.stringify({
          tool_result: {
            id: toolId,
            result: grading,
          },
        }),
        tsBase + 1,
      );
    });
  })();

  return { conversationId };
}

/**
 * Wipes every conversation + message for the given user. Use in beforeEach
 * for tests that assert specific counts or expect an empty starting state.
 * Workspace and lease rows persist (they're shared across tests).
 */
export function clearUserConversations(userId: string): void {
  db.transaction(() => {
    const convs = db
      .prepare('SELECT id FROM conversations WHERE user_id = ?')
      .all(userId) as Array<{ id: string }>;
    if (convs.length === 0) return;
    const deleteMessages = db.prepare(
      'DELETE FROM messages WHERE conversation_id = ?',
    );
    const deleteConv = db.prepare('DELETE FROM conversations WHERE id = ?');
    for (const c of convs) {
      deleteMessages.run(c.id);
      deleteConv.run(c.id);
    }
  })();
}

/**
 * Resets the demo-mode upload rate-limit table. /api/leases enforces 10
 * uploads/hour/session when LEASELENS_DEMO_MODE is on (the e2e webServer sets
 * it), and the count persists in the shared dev DB — so without a reset the
 * limit leaks across specs + runs and every upload past the 10th returns 429
 * (the dropzone fails silently and Mode B never mounts). Clearing the table in
 * setup keeps uploads deterministic. The dev server reads the same WAL DB, so
 * a delete from the test process is visible to its next request.
 */
export function clearRateLimit(): void {
  db.prepare('DELETE FROM rate_limit').run();
}

/**
 * Convenience: seed a lease row that the conversation's active_lease_id can
 * point at. Returns the lease_id so callers can pass it through.
 */
export function seedLease(opts: {
  workspaceId: string;
  uploadedBy: string;
  filename?: string;
  pageCount?: number;
}): string {
  const leaseId = randomUUID();
  db.prepare(
    `INSERT INTO leases (id, workspace_id, filename, text_extract, page_count, uploaded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    leaseId,
    opts.workspaceId,
    opts.filename ?? 'seeded-lease.pdf',
    'seeded text extract',
    opts.pageCount ?? 4,
    opts.uploadedBy,
    Math.floor(Date.now() / 1000),
  );
  return leaseId;
}
