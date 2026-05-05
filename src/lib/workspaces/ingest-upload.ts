import type Database from 'better-sqlite3';
import { ingestMarkdownFile } from '@/lib/rag/ingest';
import { createWorkspace } from './queries';

export interface UploadFile {
  filename: string;
  content: string;
  size: number;
  mimeType: string;
}

export interface ValidatedUpload {
  name: string;
  description: string;
  files: UploadFile[];
}

const MAX_FILE_BYTES = 100_000;
const MAX_FILES = 5;
const MAX_NAME_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 280;

export class UploadValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

/**
 * Validates the parsed upload (multipart-decoded). Server-side authority
 * — the client-side `<input accept>` is a hint, not a constraint.
 *
 * MIME-or-extension fallback (sprint-QA M2): accept the file if EITHER
 * MIME is text/markdown / text/plain OR filename ends in .md. Browsers
 * inconsistently report MIME for .md files (some send octet-stream).
 */
export function validateUpload(input: {
  name: string;
  description: string;
  files: UploadFile[];
}): ValidatedUpload {
  const name = input.name.trim();
  if (!name || name.length > MAX_NAME_CHARS) {
    throw new UploadValidationError(
      `Brand name must be 1-${MAX_NAME_CHARS} characters.`,
      'name',
    );
  }
  const description = input.description.trim();
  if (!description || description.length > MAX_DESCRIPTION_CHARS) {
    throw new UploadValidationError(
      `Description must be 1-${MAX_DESCRIPTION_CHARS} characters.`,
      'description',
    );
  }
  if (input.files.length === 0) {
    throw new UploadValidationError('Upload at least one .md file.', 'files');
  }
  if (input.files.length > MAX_FILES) {
    throw new UploadValidationError(`Up to ${MAX_FILES} files only.`, 'files');
  }
  for (const f of input.files) {
    if (f.size > MAX_FILE_BYTES) {
      throw new UploadValidationError(
        `${f.filename} exceeds ${MAX_FILE_BYTES} bytes.`,
        'files',
      );
    }
    const mimeOk =
      f.mimeType === 'text/markdown' || f.mimeType === 'text/plain';
    const extOk = /\.md$/i.test(f.filename);
    if (!mimeOk && !extOk) {
      throw new UploadValidationError(
        `${f.filename} is not a markdown file.`,
        'files',
      );
    }
  }
  return { name, description, files: input.files };
}

/**
 * Creates a workspace and ingests every uploaded file into it. Sequential
 * to keep complexity low; parallelizing with Promise.all is safe (each
 * file produces an independent transaction) and is the future polish.
 *
 * Round 5 — wraps the per-file loop in catch-and-delete: if any
 * ingestMarkdownFile rejects, the partially-populated chunks/documents
 * rows AND the workspace row itself are deleted before rethrowing. This
 * prevents orphan workspaces (workspaces with zero documents) from
 * accumulating across failed upload attempts. The schema does NOT have
 * ON DELETE CASCADE, so child cleanup is explicit. Spec §22.
 */
export async function ingestUpload(
  db: Database.Database,
  validated: ValidatedUpload,
): Promise<{ workspaceId: string }> {
  const workspace = createWorkspace(db, {
    name: validated.name,
    description: validated.description,
  });
  try {
    for (const file of validated.files) {
      const slug = file.filename.replace(/\.md$/i, '');
      await ingestMarkdownFile(db, {
        slug,
        content: file.content,
        workspaceId: workspace.id,
      });
    }
  } catch (err) {
    db.transaction(() => {
      db.prepare('DELETE FROM chunks WHERE workspace_id = ?').run(workspace.id);
      db.prepare('DELETE FROM documents WHERE workspace_id = ?').run(
        workspace.id,
      );
      db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspace.id);
    })();
    throw err;
  }
  return { workspaceId: workspace.id };
}
