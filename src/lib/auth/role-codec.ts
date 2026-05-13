// S19.1 — boundary codec between the application Role enum
// (Tenant/Reviewer/Admin) and the DB-persisted literals
// (Creator/Editor/Admin).
//
// Why preserve the DB literals: the audit_log table records who took
// each tool action with `actor_role`. Rewriting historical rows
// would erase the original signal — at the time those actions
// happened, the role string was 'Creator'/'Editor'. JWT cookies
// already in circulation also carry the old literals; rejecting
// them would log users out. The codec lets the application code
// speak the domain language while the database keeps its history.

import type { Role } from './types';

export type DbRole = 'Creator' | 'Editor' | 'Admin';

const TO_DB: Record<Role, DbRole> = {
  Tenant: 'Creator',
  Reviewer: 'Editor',
  Admin: 'Admin',
};

const FROM_DB: Record<DbRole, Role> = {
  Creator: 'Tenant',
  Editor: 'Reviewer',
  Admin: 'Admin',
};

export function toDbRole(role: Role): DbRole {
  return TO_DB[role];
}

export function fromDbRole(literal: DbRole | string): Role {
  const mapped = FROM_DB[literal as DbRole];
  if (!mapped) {
    throw new Error(`Unknown DB role literal: ${literal}`);
  }
  return mapped;
}
