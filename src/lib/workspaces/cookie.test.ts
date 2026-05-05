import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { decodeWorkspace, encodeWorkspace } from './cookie';

describe('workspace cookie', () => {
  it('round-trips workspace_id and created_workspace_ids', async () => {
    const token = await encodeWorkspace({
      workspace_id: 'ws-test-1',
      created_workspace_ids: ['ws-a', 'ws-b'],
    });
    const payload = await decodeWorkspace(token);
    expect(payload?.workspace_id).toBe('ws-test-1');
    expect(payload?.created_workspace_ids).toEqual(['ws-a', 'ws-b']);
  });

  it('round-trips with an empty created_workspace_ids list', async () => {
    const token = await encodeWorkspace({
      workspace_id: 'ws-test-1',
      created_workspace_ids: [],
    });
    const payload = await decodeWorkspace(token);
    expect(payload?.workspace_id).toBe('ws-test-1');
    expect(payload?.created_workspace_ids).toEqual([]);
  });

  it('decodes a legacy cookie missing created_workspace_ids as an empty list', async () => {
    // Pre-cookie-list deployments wrote tokens with only workspace_id.
    // Decode must accept those without erroring; the normalized shape is
    // an empty list (no known prior uploads).
    const secret = new TextEncoder().encode(
      process.env.CONTENTOPS_SESSION_SECRET ?? '',
    );
    const legacyToken = await new SignJWT({ workspace_id: 'ws-legacy' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);
    const payload = await decodeWorkspace(legacyToken);
    expect(payload?.workspace_id).toBe('ws-legacy');
    expect(payload?.created_workspace_ids).toEqual([]);
  });

  it('returns null for a tampered token', async () => {
    const token = await encodeWorkspace({
      workspace_id: 'ws-test-1',
      created_workspace_ids: [],
    });
    const tampered = `${token.slice(0, -10)}deadbeef00`;
    expect(await decodeWorkspace(tampered)).toBeNull();
  });

  it('returns null for a malformed token', async () => {
    expect(await decodeWorkspace('not-a-jwt')).toBeNull();
  });
});
