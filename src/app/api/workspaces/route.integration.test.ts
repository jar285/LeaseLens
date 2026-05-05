import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/rag/embed', () => ({
  embedBatch: vi.fn(async (texts: string[]) =>
    texts.map(() => Array.from({ length: 384 }, (_, i) => Math.sin(i + 1))),
  ),
}));

import { db } from '@/lib/db';
import { POST } from './route';

function makeFormData(opts: {
  name?: string;
  description?: string;
  files?: { name: string; content: string; type?: string }[];
}): FormData {
  const fd = new FormData();
  if (opts.name !== undefined) fd.append('name', opts.name);
  if (opts.description !== undefined) fd.append('description', opts.description);
  for (const f of opts.files ?? []) {
    fd.append(
      'files',
      new File([f.content], f.name, { type: f.type ?? 'text/markdown' }),
    );
  }
  return fd;
}

function makeRequest(formData: FormData): NextRequest {
  return new NextRequest('http://localhost:3000/api/workspaces', {
    method: 'POST',
    body: formData,
  });
}

describe('POST /api/workspaces (upload)', () => {
  beforeEach(() => {
    // Order matters: child rows first (chunks → documents), then workspaces.
    const sampleId = '00000000-0000-0000-0000-000000000010';
    db.prepare(`DELETE FROM chunks WHERE workspace_id != ?`).run(sampleId);
    db.prepare(`DELETE FROM documents WHERE workspace_id != ?`).run(sampleId);
    db.prepare('DELETE FROM workspaces WHERE is_sample = 0').run();
    process.env.CONTENTOPS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
  });

  afterEach(() => {
    const sampleId = '00000000-0000-0000-0000-000000000010';
    db.prepare(`DELETE FROM chunks WHERE workspace_id != ?`).run(sampleId);
    db.prepare(`DELETE FROM documents WHERE workspace_id != ?`).run(sampleId);
    db.prepare('DELETE FROM workspaces WHERE is_sample = 0').run();
  });

  it('valid upload → 200, cookie set, workspace + chunks visible in DB', async () => {
    const fd = makeFormData({
      name: 'Acme Test',
      description: 'A demo brand for upload test',
      files: [
        {
          name: 'brand-identity.md',
          content: '# Brand\n\nAcme has a direct, technical voice.',
        },
      ],
    });
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workspace_id: string };
    expect(body.workspace_id).toBeTruthy();

    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('contentops_workspace=');

    // DB has the new workspace + a document scoped to it.
    const ws = db
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(body.workspace_id);
    expect(ws).toBeDefined();
    const docCount = (
      db
        .prepare('SELECT COUNT(*) as c FROM documents WHERE workspace_id = ?')
        .get(body.workspace_id) as { c: number }
    ).c;
    expect(docCount).toBe(1);
  });

  it('missing name → 400 with field=name', async () => {
    const fd = makeFormData({
      name: '',
      description: 'A test',
      files: [{ name: 'a.md', content: '# A\n\ncontent' }],
    });
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field?: string };
    expect(body.field).toBe('name');
  });

  it('oversized file → 400 with field=files', async () => {
    const big = 'x'.repeat(200_000);
    const fd = makeFormData({
      name: 'Acme',
      description: 'A test',
      files: [{ name: 'big.md', content: big }],
    });
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field?: string };
    expect(body.field).toBe('files');
  });

  it('too many files (6) → 400 with field=files', async () => {
    const fd = makeFormData({
      name: 'Acme',
      description: 'A test',
      files: Array.from({ length: 6 }, (_, i) => ({
        name: `f${i}.md`,
        content: `# F${i}\n\ncontent ${i}`,
      })),
    });
    const res = await POST(makeRequest(fd));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field?: string };
    expect(body.field).toBe('files');
  });
});
