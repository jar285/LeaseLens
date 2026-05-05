// Mutating tools — write SQLite rows synchronously and return a
// MutationOutcome { result, compensatingActionPayload } so the registry
// can wrap the call + audit-row insert in a single sync transaction.
//
// Sprint 8 spec sections 4.1, 6.2, 6.3.

import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { MutationOutcome, ToolDescriptor } from './domain';

/**
 * Parse an ISO 8601 datetime string into Unix seconds. Throws on invalid input
 * — used to honor the validation-throw contract (spec 4.3) so bad inputs
 * never reach the SQL write or the audit row.
 */
function parseIsoToUnixSeconds(input: string): number {
  const ms = Date.parse(input);
  if (!Number.isFinite(ms)) {
    throw new Error(
      `Invalid scheduled_for: "${input}". Expected an ISO 8601 datetime (e.g. "2026-05-02T09:00:00Z").`,
    );
  }
  return Math.floor(ms / 1000);
}

export function createScheduleContentItemTool(
  db: Database.Database,
): ToolDescriptor {
  return {
    name: 'schedule_content_item',
    description:
      'Schedule a content item for publication on a given channel and time. Mutating: produces an audit_log row with a compensating undo payload.',
    inputSchema: {
      type: 'object',
      properties: {
        document_slug: {
          type: 'string',
          description: 'Slug of the document to schedule.',
        },
        scheduled_for: {
          type: 'string',
          description:
            'When to publish, as an ISO 8601 datetime string (e.g. "2026-05-02T09:00:00Z"). The server parses this; do not pass raw Unix seconds.',
        },
        channel: {
          type: 'string',
          description: 'Channel identifier (e.g., "twitter", "rss").',
        },
      },
      required: ['document_slug', 'scheduled_for', 'channel'],
    },
    roles: ['Editor', 'Admin'],
    category: 'system',
    execute: (input, ctx): MutationOutcome => {
      const slug = input.document_slug as string;
      const scheduledForRaw = input.scheduled_for as string;
      const channel = input.channel as string;

      // Validation: parse-or-throw before any SQL write so the registry's
      // transaction never opens for a bad input.
      const scheduledForUnix = parseIsoToUnixSeconds(scheduledForRaw);

      // Workspace-scoped slug existence check (Sprint 11).
      const exists = db
        .prepare('SELECT 1 FROM documents WHERE slug = ? AND workspace_id = ?')
        .get(slug, ctx.workspaceId);
      if (!exists) {
        throw new Error(`Unknown document_slug: ${slug}`);
      }

      const id = randomUUID();
      db.prepare(
        `INSERT INTO content_calendar (id, document_slug, workspace_id, scheduled_for, channel, scheduled_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        slug,
        ctx.workspaceId,
        scheduledForUnix,
        channel,
        ctx.userId,
        Math.floor(Date.now() / 1000),
      );

      // Result echoes the user-friendly ISO string the model passed in,
      // not the parsed Unix seconds — keeps the LLM-visible content
      // free of timestamps the LLM has to format.
      return {
        result: {
          schedule_id: id,
          document_slug: slug,
          scheduled_for: scheduledForRaw,
          channel,
        },
        compensatingActionPayload: { schedule_id: id },
      };
    },
    compensatingAction: (payload) => {
      // Idempotent: DELETE-by-id on a missing row affects 0 rows, no throw.
      db.prepare('DELETE FROM content_calendar WHERE id = ?').run(
        payload.schedule_id as string,
      );
    },
  };
}

export function createApproveDraftTool(db: Database.Database): ToolDescriptor {
  return {
    name: 'approve_draft',
    description:
      'Approve a draft document for publication. Admin-only; mutating; produces an audit_log row with a compensating undo payload.',
    inputSchema: {
      type: 'object',
      properties: {
        document_slug: {
          type: 'string',
          description: 'Slug of the document to approve.',
        },
        notes: {
          type: 'string',
          description: 'Optional approval notes.',
        },
      },
      required: ['document_slug'],
    },
    roles: ['Admin'],
    category: 'system',
    execute: (input, ctx): MutationOutcome => {
      const slug = input.document_slug as string;
      const notes = (input.notes ?? null) as string | null;

      // Workspace-scoped slug existence check (Sprint 11).
      const exists = db
        .prepare('SELECT 1 FROM documents WHERE slug = ? AND workspace_id = ?')
        .get(slug, ctx.workspaceId);
      if (!exists) {
        throw new Error(`Unknown document_slug: ${slug}`);
      }

      const id = randomUUID();
      db.prepare(
        `INSERT INTO approvals (id, document_slug, workspace_id, approved_by, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        slug,
        ctx.workspaceId,
        ctx.userId,
        notes,
        Math.floor(Date.now() / 1000),
      );

      return {
        result: { approval_id: id, document_slug: slug, notes },
        compensatingActionPayload: { approval_id: id },
      };
    },
    compensatingAction: (payload) => {
      db.prepare('DELETE FROM approvals WHERE id = ?').run(
        payload.approval_id as string,
      );
    },
  };
}
