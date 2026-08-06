/**
 * Sprint 13 §3c — POST /api/leases
 *
 * Multipart upload route for tenant-supplied NJ lease PDFs. Pipeline:
 *   1. Resolve user + workspace (fail-closed in public-anon mode; #15).
 *   2. Guardrail rate limit (existing helper, 10 req/hour).
 *   3. validateLeaseUpload (size + content-type).
 *   4. parsePdf (text extraction).
 *   5. Detect text-layer-empty PDFs (every page < MIN_PAGE_TEXT_CHARS).
 *   6. segmentClauses + classifyClause.
 *   7. db.transaction: INSERT into leases + INSERTs into clauses.
 *   8. If conversationId supplied AND owned by caller, setActiveLease.
 *   9. Return { lease_id, page_count, clause_count }.
 *
 * Status-code conventions per spec §4 acceptance criteria:
 *   400 — missing file / general validation
 *   401 — public-anon mode with no/invalid session or workspace (fail closed)
 *   413 — file size exceeds LEASELENS_LEASE_MAX_BYTES
 *   415 — wrong content-type
 *   422 — PDF parse failure or no text layer
 *   429 — rate limit exceeded
 *
 * Sprint B.15 (#15) — identity + workspace resolve through the shared
 * fail-closed `requireSessionOrAnon`. In public-anon mode a missing/invalid
 * session or workspace → 401; it NEVER falls back to the seeded demo Tenant or
 * the immortal sample workspace. Write path → `requireActiveWorkspace: false`
 * so the visitor's per-visitor workspace can be materialized below.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { ensureAnonUserExists } from '@/lib/auth/anon-identity';
import { guardrailsEnforced, isPublicAnonMode } from '@/lib/auth/mode';
import { requireSessionOrAnon } from '@/lib/auth/resolve-session';
import { db } from '@/lib/db';
import { defaultTiers, enforceQuota } from '@/lib/db/quota';
import { checkAndIncrementRateLimit } from '@/lib/db/rate-limit';
import { env } from '@/lib/env';
import { clientSubnet } from '@/lib/http/client-ip';
import { errorResponse } from '@/lib/http/error-response';
import { MIN_PAGE_TEXT_CHARS, parsePdf } from '@/lib/lease/parse-pdf';
import { insertClause, insertLease, setActiveLease } from '@/lib/lease/queries';
import { segmentClauses } from '@/lib/lease/segment-clauses';
import { validateLeaseUpload } from '@/lib/lease/validate-upload';
import { logger } from '@/lib/log/logger';
import { requestIdFrom } from '@/lib/log/request-id';
import { weightFor } from '@/lib/quota/weights';
import { purgeExpiredWorkspaces } from '@/lib/workspaces/cleanup';
import { ensureAnonWorkspaceExists } from '@/lib/workspaces/queries';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = requestIdFrom(req.headers);
  try {
    const resolved = await requireSessionOrAnon(req, db, {
      requestId,
      requireActiveWorkspace: false,
    });
    if (!resolved.ok) return resolved.response;
    const { userId, workspaceId } = resolved;

    // Sprint B.9 (#9) / C.17 (#17) — guardrails enforce whenever the app is
    // exposed. Public-anon uses the composite-key quota (upload is a heavier
    // weighted action); the demo profile keeps the legacy single-key limiter.
    if (guardrailsEnforced()) {
      if (isPublicAnonMode()) {
        const result = enforceQuota(
          db,
          defaultTiers({
            userId,
            subnet: clientSubnet(req.headers),
            route: '/api/leases',
          }),
          weightFor('upload'),
        );
        if (!result.allowed) {
          return errorResponse('RATE_LIMITED', {
            requestId,
            retryAfterSeconds: result.retryAfterSeconds,
          });
        }
      } else {
        const rl = checkAndIncrementRateLimit(userId);
        if (!rl.allowed) {
          return errorResponse('RATE_LIMITED', {
            requestId,
            message: 'Rate limit exceeded. Try again in an hour.',
          });
        }
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
      // Sprint D.12a (#12) — normalized envelope; validation.error is
      // developer-authored copy from validateLeaseUpload (safe to surface).
      let code: 'VALIDATION' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' =
        'VALIDATION';
      if (
        errMsg.includes('exceeds') ||
        errMsg.includes('too large') ||
        errMsg.includes('byte')
      ) {
        code = 'PAYLOAD_TOO_LARGE';
      } else if (
        errMsg.includes('content-type') ||
        errMsg.includes('unsupported')
      ) {
        code = 'UNSUPPORTED_MEDIA_TYPE';
      }
      return errorResponse(code, { requestId, message: validation.error });
    }

    // Lazy TTL purge (Spec §4.5) before inserting.
    purgeExpiredWorkspaces(db);

    // Sprint B.15 (#15) — public-anon: materialize the visitor's OWN users row
    // (FK) + non-sample expiring workspace, gated on isPublicAnonMode() (NOT
    // guardrailsEnforced(), which is also true in demo mode — running these on a
    // demo user id would recreate the sample as non-sample and the next purge
    // would delete it). This MUST run AFTER purgeExpiredWorkspaces: a returning
    // visitor whose per-visitor workspace has aged past the TTL would otherwise
    // be re-materialized and then purged out from under insertLease.
    if (isPublicAnonMode()) {
      ensureAnonUserExists(db, userId);
      ensureAnonWorkspaceExists(db, workspaceId);
    }

    const buffer = new Uint8Array(await validation.file.arrayBuffer());

    let parsed: Awaited<ReturnType<typeof parsePdf>>;
    try {
      parsed = await parsePdf(buffer);
    } catch (err) {
      // Sprint D.12a (#12) — canned message, never the raw pdfjs err.message
      // (a library message is not our copy and could embed anything). Detail
      // stays in the server log via the top-level catch pattern.
      logger.warn(
        { err, requestId },
        'lease.pdf_parse_failed: returning 422 to client',
      );
      return errorResponse('TOOL_FAILED', {
        requestId,
        message: 'PDF parse error: the file could not be read as a PDF.',
      });
    }

    if (parsed.pageCount > env.LEASELENS_LEASE_MAX_PAGES) {
      return errorResponse('PAYLOAD_TOO_LARGE', {
        requestId,
        message: `PDF has ${parsed.pageCount} pages; cap is ${env.LEASELENS_LEASE_MAX_PAGES}.`,
      });
    }

    const allBelowMin = parsed.pages.every(
      (p) => p.text.trim().length < MIN_PAGE_TEXT_CHARS,
    );
    if (allBelowMin) {
      // Sprint D.12a (#12) — the envelope `code` is now the typed enum; the
      // old ad-hoc `pdf_no_text_layer` identity (unconsumed by any client)
      // rides along as `reason` for greppability/API compat.
      return errorResponse('TOOL_FAILED', {
        requestId,
        message:
          'PDF text layer is empty or unreadable. The lease may be a scanned image; paste the text directly instead.',
        extra: { reason: 'pdf_no_text_layer' },
      });
    }

    const segmented = segmentClauses(parsed.pages);

    // Atomic write: lease + clauses + (optional) active-lease pointer.
    const tx = db.transaction(() => {
      const leaseId = insertLease(db, {
        workspaceId,
        filename: validation.file.name || 'lease.pdf',
        textExtract: parsed.pages.map((p) => p.text).join('\n\n'),
        pageCount: parsed.pageCount,
        uploadedBy: userId,
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
          conv.user_id === userId &&
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
    logger.error({ err }, 'lease.upload_failed');
    return errorResponse('INTERNAL', {
      requestId,
      message: 'Lease upload failed',
    });
  }
}
