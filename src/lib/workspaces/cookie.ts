/**
 * Signed JWT cookie carrying the active workspace_id. Mirrors the
 * session-cookie shape at src/lib/auth/session.ts (HS256, 24h exp,
 * CONTENTOPS_SESSION_SECRET reused — no new env var introduced).
 *
 * Workspace and role are kept in separate cookies because they're
 * orthogonal concerns (Spec §4.3). A user might switch workspaces while
 * keeping their role; combining the two would couple unrelated state
 * changes into one JWT rotation.
 */

import { jwtVerify, SignJWT } from 'jose';
import type { WorkspaceCookiePayload } from './types';

export const WORKSPACE_COOKIE_NAME = 'contentops_workspace';

function getSecret(): Uint8Array {
  const raw = process.env.CONTENTOPS_SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      'CONTENTOPS_SESSION_SECRET must be set and at least 32 characters.',
    );
  }
  return new TextEncoder().encode(raw);
}

export async function encodeWorkspace(
  payload: WorkspaceCookiePayload,
): Promise<string> {
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());
}

export async function decodeWorkspace(
  token: string,
): Promise<WorkspaceCookiePayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    });
    const raw = payload as Record<string, unknown>;
    if (typeof raw.workspace_id !== 'string') return null;
    const list = Array.isArray(raw.created_workspace_ids)
      ? raw.created_workspace_ids.filter(
          (v): v is string => typeof v === 'string',
        )
      : [];
    return { workspace_id: raw.workspace_id, created_workspace_ids: list };
  } catch {
    return null;
  }
}
