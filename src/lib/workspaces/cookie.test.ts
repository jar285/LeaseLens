import { describe, expect, it } from 'vitest';
import { decodeWorkspace, encodeWorkspace } from './cookie';

describe('workspace cookie', () => {
  it('round-trips a workspace_id through encode/decode', async () => {
    const token = await encodeWorkspace({ workspace_id: 'ws-test-1' });
    const payload = await decodeWorkspace(token);
    expect(payload?.workspace_id).toBe('ws-test-1');
  });

  it('returns null for a tampered token', async () => {
    const token = await encodeWorkspace({ workspace_id: 'ws-test-1' });
    const tampered = `${token.slice(0, -10)}deadbeef00`;
    expect(await decodeWorkspace(tampered)).toBeNull();
  });

  it('returns null for a malformed token', async () => {
    expect(await decodeWorkspace('not-a-jwt')).toBeNull();
  });
});
