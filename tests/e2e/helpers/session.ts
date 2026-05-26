// Sprint 25.2 — shared session-cookie helper for E2E tests.
//
// Extracted from chat-tool-use.spec.ts:14-50 + cockpit-dashboard.spec.ts:67-102
// where the same 6-step cookie flow was about to be copied across four new
// spec files. Two callers ≠ a framework, but six does cross the threshold.

import type { BrowserContext } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { encodeWorkspace } from '@/lib/workspaces/cookie';

export interface SetSessionCookiesOptions {
  /** Workspace ID for the workspace cookie. Defaults to SAMPLE_WORKSPACE.id. */
  workspaceId?: string;
}

/**
 * Sets the `leaselens_session` and `leaselens_workspace` cookies for the
 * given demo role. Mirrors what the dev server expects on every request:
 *   - session cookie carries the encrypted SessionPayload (userId, role, displayName)
 *   - workspace cookie binds the request to a workspace so the chat/cockpit
 *     routes don't redirect to /onboarding
 */
export async function setSessionCookies(
  context: BrowserContext,
  role: Role,
  opts: SetSessionCookiesOptions = {},
): Promise<void> {
  const user = DEMO_USERS.find((u) => u.role === role);
  if (!user) throw new Error(`Demo user not seeded for role: ${role}`);

  const sessionToken = await encrypt({
    userId: user.id,
    role,
    displayName: user.display_name,
  });
  const workspaceToken = await encodeWorkspace({
    workspace_id: opts.workspaceId ?? SAMPLE_WORKSPACE.id,
    created_workspace_ids: [],
  });

  await context.addCookies([
    {
      name: 'leaselens_session',
      value: sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'leaselens_workspace',
      value: workspaceToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}
