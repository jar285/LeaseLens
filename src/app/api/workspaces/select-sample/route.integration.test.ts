import { beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { POST } from './route';

describe('POST /api/workspaces/select-sample', () => {
  beforeEach(() => {
    process.env.CONTENTOPS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
  });

  it('returns 200 with the sample workspace id', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { workspace_id: string };
    expect(body.workspace_id).toBe(SAMPLE_WORKSPACE.id);
  });

  it('sets the contentops_workspace cookie on the response', async () => {
    const res = await POST();
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('contentops_workspace=');
    // 24h max-age
    expect(setCookie).toMatch(/Max-Age=86400/);
  });
});
