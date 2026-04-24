import { jwtVerify, SignJWT } from 'jose';
import type { SessionClaims, SessionPayload } from './types';

/**
 * Read the session secret directly from process.env — NOT from the
 * Zod-validated env module, which calls process.exit() and is
 * incompatible with the Edge Runtime.
 *
 * The Zod validation (z.string().min(32)) still runs at Node.js
 * boot via env.ts, so this value is safe once the app is running.
 */
function getSecret(): Uint8Array {
  const raw = process.env.CONTENTOPS_SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      'CONTENTOPS_SESSION_SECRET must be set and at least 32 characters.',
    );
  }
  return new TextEncoder().encode(raw);
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  return await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecret());
}

export async function decrypt(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    });
    return payload as unknown as SessionClaims;
  } catch {
    return null;
  }
}
