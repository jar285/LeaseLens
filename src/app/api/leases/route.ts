/**
 * Sprint 13 §3c — POST /api/leases
 *
 * Multipart upload route for tenant-supplied NJ lease PDFs. Pipeline:
 *   1. Resolve user from session cookie (default Creator/Tenant fallback).
 *   2. Resolve workspace from cookie (default sample workspace).
 *   3. Demo-mode rate limit (existing helper, 10 req/hour).
 *   4. validateLeaseUpload (size + content-type).
 *   5. parsePdf (text extraction).
 *   6. Detect text-layer-empty PDFs (every page < MIN_PAGE_TEXT_CHARS).
 *   7. segmentClauses + classifyClause.
 *   8. db.transaction: INSERT into leases + INSERTs into clauses.
 *   9. If conversationId supplied AND owned by caller, setActiveLease.
 *  10. Return { lease_id, page_count, clause_count }.
 *
 * Status-code conventions per spec §4 acceptance criteria:
 *   400 — missing file / general validation
 *   413 — file size exceeds LEASELENS_LEASE_MAX_BYTES
 *   415 — wrong content-type
 *   422 — PDF parse failure or no text layer
 *   429 — rate limit exceeded
 */

import { type NextRequest, NextResponse } from 'next/server';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { checkAndIncrementRateLimit } from '@/lib/db/rate-limit';
import { env } from '@/lib/env';
import { MIN_PAGE_TEXT_CHARS, parsePdf } from '@/lib/lease/parse-pdf';
import { insertClause, insertLease, setActiveLease } from '@/lib/lease/queries';
import { segmentClauses } from '@/lib/lease/segment-clauses';
import { validateLeaseUpload } from '@/lib/lease/validate-upload';
import { purgeExpiredWorkspaces } from '@/lib/workspaces/cleanup';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  decodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';

export const runtime = 'nodejs';

interface ResolvedSession {
  userId: string;
  role: Role;
}

async function resolveSession(req: NextRequest): Promise<ResolvedSession> {
  const cookie = req.cookies.get('leaselens_session');
  if (cookie) {
    const claims = await decrypt(cookie.value);
    if (claims) {
      return { userId: claims.userId, role: claims.role };
    }
  }
  const fallback = DEMO_USERS.find((u) => u.role === 'Creator');
  if (!fallback) {
    throw new Error('No Creator demo user seeded; seed.ts must run first');
  }
  return { userId: fallback.id, role: 'Creator' };
}

async function resolveWorkspaceId(req: NextRequest): Promise<string> {
  const cookie = req.cookies.get(WORKSPACE_COOKIE_NAME);
  if (cookie) {
    const decoded = await decodeWorkspace(cookie.value);
    if (decoded?.workspace_id) {
      const exists = db
        .prepare('SELECT id FROM workspaces WHERE id = ?')
        .get(decoded.workspace_id);
      if (exists) return decoded.workspace_id;
    }
  }
  return SAMPLE_WORKSPACE.id;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await resolveSession(req);
    const workspaceId = await resolveWorkspaceId(req);

    // Demo-mode rate limit (charter §11b).
    if (env.LEASELENS_DEMO_MODE) {
      const rl = checkAndIncrementRateLimit(session.userId);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: 'Rate limit exceeded. Try again in an hour.' },
          { status: 429 },
        );
      }
    }

    const form = await req.formData();
    const fileField = form.get('file');
    const conversationIdField = form.get('conversationId');
    const conversationId =
      typeof conversationIdField === 'string' && conversationIdField.length > 0
        ? conversationIdField
        : undefined;

    const file = fileField instanceof File ? fileField : null;
    const validation = validateLeaseUpload(file);
    if (!validation.ok) {
      const errMsg = validation.error.toLowerCase();
      // Order matters: a missing file produces a "PDF file is required"
      // string that would otherwise match the content-type branch below.
      let status = 400;
      if (
        errMsg.includes('exceeds') ||
        errMsg.includes('too large') ||
        errMsg.includes('byte')
      ) {
        status = 413;
      } else if (
        errMsg.includes('content-type') ||
        errMsg.includes('unsupported')
      ) {
        status = 415;
      }
      return NextResponse.json({ error: validation.error }, { status });
    }

    // Lazy TTL purge (Spec §4.5) before inserting.
    purgeExpiredWorkspaces(db);

    const buffer = new Uint8Array(await validation.file.arrayBuffer());

    let parsed: Awaited<ReturnType<typeof parsePdf>>;
    try {
      parsed = await parsePdf(buffer);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'parse failed';
      return NextResponse.json(
        { error: `PDF parse error: ${message}` },
        { status: 422 },
      );
    }

    if (parsed.pageCount > env.LEASELENS_LEASE_MAX_PAGES) {
      return NextResponse.json(
        {
          error: `PDF has ${parsed.pageCount} pages; cap is ${env.LEASELENS_LEASE_MAX_PAGES}.`,
        },
        { status: 413 },
      );
    }

    const allBelowMin = parsed.pages.every(
      (p) => p.text.trim().length < MIN_PAGE_TEXT_CHARS,
    );
    if (allBelowMin) {
      return NextResponse.json(
        {
          error:
            'PDF text layer is empty or unreadable. The lease may be a scanned image; paste the text directly instead.',
          code: 'pdf_no_text_layer',
        },
        { status: 422 },
      );
    }

    const segmented = segmentClauses(parsed.pages);

    // Atomic write: lease + clauses + (optional) active-lease pointer.
    const tx = db.transaction(() => {
      const leaseId = insertLease(db, {
        workspaceId,
        filename: validation.file.name || 'lease.pdf',
        textExtract: parsed.pages.map((p) => p.text).join('\n\n'),
        pageCount: parsed.pageCount,
        uploadedBy: session.userId,
      });

      for (const seg of segmented) {
        insertClause(db, {
          leaseId,
          workspaceId,
          clauseIndex: seg.clauseIndex,
          clauseType: seg.clauseType,
          text: seg.text,
          pageNumber: seg.pageNumber,
        });
      }

      // Conditionally bind to a conversation. Ownership-checked: the
      // conversation must belong to the same user AND workspace; we
      // refuse to set active_lease_id on someone else's conversation.
      if (conversationId) {
        const conv = db
          .prepare(
            'SELECT user_id, workspace_id FROM conversations WHERE id = ?',
          )
          .get(conversationId) as
          | { user_id: string; workspace_id: string }
          | undefined;
        if (
          conv &&
          conv.user_id === session.userId &&
          conv.workspace_id === workspaceId
        ) {
          setActiveLease(db, conversationId, leaseId);
        }
      }

      return { leaseId, clauseCount: segmented.length };
    });

    const { leaseId, clauseCount } = tx();

    return NextResponse.json(
      {
        lease_id: leaseId,
        page_count: parsed.pageCount,
        clause_count: clauseCount,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('Lease upload failed:', err);
    return NextResponse.json({ error: 'Lease upload failed' }, { status: 500 });
  }
}
