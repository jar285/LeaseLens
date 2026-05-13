import { jwtVerify, SignJWT } from 'jose';
import { type DbRole, fromDbRole, toDbRole } from './role-codec';
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
  const raw = process.env.LEASELENS_SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      'LEASELENS_SESSION_SECRET must be set and at least 32 characters.',
    );
  }
  return new TextEncoder().encode(raw);
}

// S19.1 — JWT payload carries the DB literal (Creator/Editor/Admin)
// so cookies issued before the rename keep decoding. The TS domain
// uses Tenant/Reviewer/Admin everywhere else.
interface WireSessionPayload {
  userId: string;
  role: DbRole;
  displayName: string;
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  const wire: WireSessionPayload = {
    userId: payload.userId,
    role: toDbRole(payload.role),
    displayName: payload.displayName,
  };
  return await new SignJWT(wire as unknown as Record<string, unknown>)
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
    const raw = payload as unknown as {
      userId: string;
      role: string;
      displayName: string;
      iat?: number;
      exp?: number;
    };
    // Accept both wire literals (Creator/Editor/Admin) and post-rename
    // literals (Tenant/Reviewer/Admin) so the JWT-issuing surface can
    // migrate over time without invalidating live sessions.
    const role = raw.role.match(/^(Tenant|Reviewer|Admin)$/)
      ? (raw.role as 'Tenant' | 'Reviewer' | 'Admin')
      : fromDbRole(raw.role);
    return {
      userId: raw.userId,
      role,
      displayName: raw.displayName,
      iat: raw.iat,
      exp: raw.exp,
    };
  } catch {
    return null;
  }
}
