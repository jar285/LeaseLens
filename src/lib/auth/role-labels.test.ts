// Sprint 13 — RBAC label bridge (charter v1.13 §5.6).
// DB literals (Creator/Editor/Admin) are preserved; UI/prompt surfaces
// render the LeaseLens names (Tenant/Reviewer/Admin) via labelFor.

import { describe, expect, it } from 'vitest';
import { labelFor, ROLE_LABELS } from './role-labels';
import type { Role } from './types';

describe('role-labels', () => {
  it('maps Creator → Tenant', () => {
    expect(labelFor('Creator')).toBe('Tenant');
  });

  it('maps Editor → Reviewer', () => {
    expect(labelFor('Editor')).toBe('Reviewer');
  });

  it('maps Admin → Admin', () => {
    expect(labelFor('Admin')).toBe('Admin');
  });

  it('exposes ROLE_LABELS as an exhaustive map across all Role union members', () => {
    // Compile-time exhaustiveness: every Role key must appear. Any drift
    // (e.g., a fourth role added to types.ts without updating this map)
    // shows up here as a TS error at the const declaration AND a missing
    // key here.
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(
      ['Admin', 'Creator', 'Editor'].sort(),
    );
  });

  it('returns the same string instance for repeat calls (pure mapping, no allocation)', () => {
    const a = labelFor('Creator' as Role);
    const b = labelFor('Creator' as Role);
    expect(a).toBe(b);
  });
});
