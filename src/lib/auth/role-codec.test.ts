// S19.1 — boundary codec between the application Role enum
// (Tenant/Reviewer/Admin) and the DB-persisted literals
// (Creator/Editor/Admin). Audit log history and existing JWT cookies
// continue to carry the original literals; the codec translates them
// at the auth/persistence boundary so the rest of the codebase
// speaks the domain language.

import { describe, expect, it } from 'vitest';
import { type DbRole, fromDbRole, toDbRole } from './role-codec';
import type { Role } from './types';

describe('role-codec', () => {
  it('maps Tenant → Creator on write', () => {
    expect(toDbRole('Tenant')).toBe('Creator');
  });

  it('maps Reviewer → Editor on write', () => {
    expect(toDbRole('Reviewer')).toBe('Editor');
  });

  it('passes Admin through unchanged on write', () => {
    expect(toDbRole('Admin')).toBe('Admin');
  });

  it('maps Creator → Tenant on read', () => {
    expect(fromDbRole('Creator')).toBe('Tenant');
  });

  it('maps Editor → Reviewer on read', () => {
    expect(fromDbRole('Editor')).toBe('Reviewer');
  });

  it('passes Admin through unchanged on read', () => {
    expect(fromDbRole('Admin')).toBe('Admin');
  });

  it('round-trips Role → DbRole → Role for every member of the union', () => {
    const allRoles: Role[] = ['Tenant', 'Reviewer', 'Admin'];
    for (const role of allRoles) {
      expect(fromDbRole(toDbRole(role))).toBe(role);
    }
  });

  it('round-trips DbRole → Role → DbRole for every member of the union', () => {
    const allDbRoles: DbRole[] = ['Creator', 'Editor', 'Admin'];
    for (const dbRole of allDbRoles) {
      expect(toDbRole(fromDbRole(dbRole))).toBe(dbRole);
    }
  });

  it('throws on an unrecognised DB literal so corrupt rows surface loudly', () => {
    expect(() => fromDbRole('Stranger' as DbRole)).toThrow(/role/i);
  });
});
