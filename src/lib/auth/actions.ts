'use server';

import { cookies } from 'next/headers';
import { DEMO_USERS } from './constants';
import { encrypt } from './session';
import type { Role } from './types';

// Sprint 25.1 (R1) — this action no longer calls `revalidatePath('/')`.
// The caller (RoleSwitcher) drives a soft re-render via `router.refresh()`
// after the action resolves. revalidatePath would have invalidated the
// route cache and risked remounting LeaseLensWorkspaceShell, which
// Sprint 25's IndexedDB-restore path then had to compensate for (the
// "Restoring..." flash). router.refresh() merges the new RSC payload
// while preserving client React state — no remount, no flash.
// Sprint A.3 (#3) — role switching is a DEMO-ONLY affordance, gated at the
// server boundary. Reviewer/Admin bypass tenant ownership in
// assert-lease-ownership, so a public/anonymous deploy (LEASELENS_DEMO_MODE
// off) must never be able to self-assign a privileged role — hidden UI is not
// a security boundary (Robert C. Martin: authorization belongs at the server
// boundary). Read process.env at call time (not the cached `env` singleton) so
// the gate reflects the live deploy profile; Phase B (#9) consolidates this
// into auth/mode.ts `demoAffordancesEnabled()`.
function demoModeEnabled(): boolean {
  const v = process.env.LEASELENS_DEMO_MODE;
  return v === 'true' || v === '1';
}

export async function switchRole(role: Role) {
  if (!demoModeEnabled()) {
    throw new Error('Role switching is disabled outside demo mode');
  }

  const targetUser = DEMO_USERS.find((u) => u.role === role);
  if (!targetUser) {
    throw new Error(`Invalid role: ${role}`);
  }

  const session = {
    userId: targetUser.id,
    role: targetUser.role,
    displayName: targetUser.display_name,
  };

  const token = await encrypt(session);

  const cookieStore = await cookies();
  cookieStore.set('leaselens_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });
}
