// Sprint B.14 (#14) — per-visitor anonymous identity.
//
// Anonymous maps to a REAL, isolated `users` row (role Tenant), NOT the shared
// seeded demo Tenant — because `conversations.user_id REFERENCES users(id)`, so
// a bare cookie claim with no matching row would FK-fail on the first chat
// write. Each visitor's conversations/uploads bind to this fresh id, which is
// how isolation is achieved (React Team / Dan Abramov: state ownership; Don
// Norman: "this review is mine, temporary, and isolated").

import type Database from 'better-sqlite3';
import { toDbRole } from './role-codec';
import type { Role, SessionPayload } from './types';

export const ANON_DISPLAY_NAME = 'Anonymous Tenant';

export interface AnonIdentity extends SessionPayload {
  role: Role; // always 'Tenant'
  anonymous: true;
}

/**
 * Mint a fresh anonymous identity. Edge-safe: uses the GLOBAL `crypto`
 * (Web Crypto, available in the Edge runtime where middleware mints the
 * session); `node:crypto` is not. No DB access — the row is materialized in
 * Node via ensureAnonUserExists.
 */
export function newAnonIdentity(): AnonIdentity {
  return {
    userId: crypto.randomUUID(),
    role: 'Tenant',
    displayName: ANON_DISPLAY_NAME,
    anonymous: true,
  };
}

/**
 * Node-only: materialize the anonymous visitor's `users` row so the
 * conversations FK is satisfied before any write. Idempotent (INSERT OR
 * IGNORE), mirroring ensureDemoUsersExist. The role is persisted as the DB
 * literal ('Creator'); the email is synthesized unique-per-id (users.email is
 * UNIQUE NOT NULL).
 */
export function ensureAnonUserExists(
  db: Database.Database,
  userId: string,
): void {
  db.prepare(
    'INSERT OR IGNORE INTO users (id, email, role, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    userId,
    `anon+${userId}@anon.leaselens.local`,
    toDbRole('Tenant'),
    ANON_DISPLAY_NAME,
    Math.floor(Date.now() / 1000),
  );
}
