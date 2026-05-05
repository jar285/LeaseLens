import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { POST } from './route';

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/workspaces/select-sample', {
    method: 'POST',
  });
}

describe('POST /api/workspaces/select-sample', () => {
  beforeEach(() => {
    process.env.CONTENTOPS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
  });

  it('returns 200 with the sample workspace id', async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workspace_id: string };
    expect(body.workspace_id).toBe(SAMPLE_WORKSPACE.id);
  });

  it('sets the contentops_workspace cookie on the response', async () => {
    const res = await POST(makeRequest());
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('contentops_workspace=');
    expect(setCookie).toMatch(/Max-Age=86400/);
  });

  it('preserves the visitor created_workspace_ids list when switching to sample', async () => {
    // Visitor previously uploaded two brands. Switching to sample shouldn't
    // erase that history — they need to switch back later.
    const incoming = await encodeWorkspace({
      workspace_id: 'ws-prior-active',
      created_workspace_ids: ['ws-a', 'ws-b'],
    });
    const req = makeRequest();
    req.cookies.set(WORKSPACE_COOKIE_NAME, incoming);

    const res = await POST(req);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('contentops_workspace=');
  });
});
