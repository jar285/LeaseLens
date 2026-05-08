// Sprint 13 §2.12 — Tenant ownership invariant.
//
// Tenants (DB literal: Creator) act only on leases they themselves
// uploaded. Reviewers (Editor) and Admins bypass the check — Reviewers
// represent the legal-aid-clinic persona that consults across multiple
// tenants in a workspace.

import type { Role } from '@/lib/auth/types';

export interface OwnedLease {
  id: string;
  workspace_id: string;
  uploaded_by: string;
}

export interface OwnershipContext {
  role: Role;
  userId: string;
}

export function assertLeaseOwnership(
  lease: OwnedLease,
  ctx: OwnershipContext,
): void {
  if (!lease) {
    throw new Error(
      'assertLeaseOwnership called without a lease — caller must load the lease before checking ownership.',
    );
  }
  if (ctx.role !== 'Creator') {
    return;
  }
  if (lease.uploaded_by !== ctx.userId) {
    throw new Error(
      `Tenant ${ctx.userId} does not own lease ${lease.id}; only the uploader may access or modify it.`,
    );
  }
}
