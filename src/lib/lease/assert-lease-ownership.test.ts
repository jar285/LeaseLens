// Sprint 13 §2.12 — Tenant ownership invariant.
// Tenants (DB literal: Creator) may only act on leases they uploaded.
// Reviewers (Editor) and Admins bypass the check.

import { describe, expect, it } from 'vitest';
import type { Role } from '@/lib/auth/types';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { assertLeaseOwnership } from './assert-lease-ownership';

interface LeaseRow {
  id: string;
  workspace_id: string;
  uploaded_by: string;
}

function lease(uploadedBy: string): LeaseRow {
  return {
    id: 'lease-1',
    workspace_id: SAMPLE_WORKSPACE.id,
    uploaded_by: uploadedBy,
  };
}

function ctx(role: Role, userId: string) {
  return {
    role,
    userId,
    workspaceId: SAMPLE_WORKSPACE.id,
    conversationId: 'conv-1',
  };
}

describe('assertLeaseOwnership', () => {
  describe('Tenant (Creator) role', () => {
    it('does not throw when lease.uploaded_by matches ctx.userId', () => {
      expect(() =>
        assertLeaseOwnership(lease('u-tenant'), ctx('Tenant', 'u-tenant')),
      ).not.toThrow();
    });

    it('throws when lease.uploaded_by is a different user', () => {
      expect(() =>
        assertLeaseOwnership(
          lease('u-someone-else'),
          ctx('Tenant', 'u-tenant'),
        ),
      ).toThrow(/own|tenant|access/i);
    });
  });

  describe('Reviewer (Editor) role', () => {
    it('does not throw when uploaded by another user — Reviewers see all leases in the workspace', () => {
      expect(() =>
        assertLeaseOwnership(lease('u-tenant'), ctx('Reviewer', 'u-reviewer')),
      ).not.toThrow();
    });

    it('does not throw when uploaded by the Reviewer themselves', () => {
      expect(() =>
        assertLeaseOwnership(
          lease('u-reviewer'),
          ctx('Reviewer', 'u-reviewer'),
        ),
      ).not.toThrow();
    });
  });

  describe('Admin role', () => {
    it('does not throw regardless of uploaded_by', () => {
      expect(() =>
        assertLeaseOwnership(lease('u-tenant'), ctx('Admin', 'u-admin')),
      ).not.toThrow();
    });
  });

  it('throws defensively when lease is null/undefined', () => {
    // A safety net for callers that forget to handle a missing lease before
    // the ownership check. Throwing here turns a quiet null-deref into a
    // legible 4xx upstream.
    expect(() =>
      assertLeaseOwnership(
        undefined as unknown as LeaseRow,
        ctx('Tenant', 'u-tenant'),
      ),
    ).toThrow();
  });
});
