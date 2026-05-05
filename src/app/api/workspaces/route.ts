/**
 * POST /api/workspaces — multipart upload that creates a fresh workspace
 * and ingests the supplied .md files into it. The onboarding "Upload your
 * brand" form POSTs here.
 *
 * Spec §4.4. Lazy TTL purge runs before the new INSERT (Spec §4.5).
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { WORKSPACE_TTL_SECONDS } from '@/lib/workspaces/constants';
import {
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { purgeExpiredWorkspaces } from '@/lib/workspaces/cleanup';
import {
  ingestUpload,
  UploadValidationError,
  validateUpload,
  type UploadFile,
} from '@/lib/workspaces/ingest-upload';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const form = await req.formData();
    const name = String(form.get('name') ?? '');
    const description = String(form.get('description') ?? '');
    const fileEntries = form
      .getAll('files')
      .filter((f): f is File => f instanceof File);

    const files: UploadFile[] = await Promise.all(
      fileEntries.map(async (f) => ({
        filename: f.name,
        content: await f.text(),
        size: f.size,
        mimeType: f.type || 'application/octet-stream',
      })),
    );

    const validated = validateUpload({ name, description, files });

    // Lazy TTL purge BEFORE insert (Spec §4.5).
    purgeExpiredWorkspaces(db);

    const { workspaceId } = await ingestUpload(db, validated);
    const token = await encodeWorkspace({ workspace_id: workspaceId });

    const res = NextResponse.json({ workspace_id: workspaceId }, { status: 200 });
    res.cookies.set(WORKSPACE_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: WORKSPACE_TTL_SECONDS,
    });
    return res;
  } catch (err) {
    if (err instanceof UploadValidationError) {
      return NextResponse.json(
        { error: err.message, field: err.field },
        { status: 400 },
      );
    }
    console.error('Workspace upload failed:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
