// S19.1 — application-side role union.
//
// The TypeScript domain speaks the LeaseLens names: Tenant, Reviewer,
// Admin. The DB persists the original Sprint-13 literals
// (Creator, Editor, Admin) so audit-log history stays intact and
// existing browser sessions keep decoding. The translation between
// the two lives in `role-codec.ts` and runs only at the auth /
// persistence boundary.
export type Role = 'Tenant' | 'Reviewer' | 'Admin';

export interface SessionPayload {
  userId: string;
  role: Role;
  displayName: string;
  // Sprint B.14 (#14) — true for a per-visitor anonymous session (public-anon
  // mode). Distinguishes a real anonymous visitor (a fresh, isolated,
  // expiring identity) from the seeded demo Tenant. Optional so legacy cookies
  // (issued before #14) decode unchanged with `anonymous` falsy.
  anonymous?: boolean;
}

export interface SessionClaims extends SessionPayload {
  iat?: number;
  exp?: number;
}
