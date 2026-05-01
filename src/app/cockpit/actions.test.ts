import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { cookies } from 'next/headers';
import {
  refreshApprovals,
  refreshAuditFeed,
  refreshEvalHealth,
  refreshSchedule,
  refreshSpend,
} from './actions';

async function mockSessionFor(
  role: 'Creator' | 'Editor' | 'Admin' | null,
): Promise<void> {
  if (role === null) {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: () => undefined,
    });
    return;
  }
  const user = DEMO_USERS.find((u) => u.role === role);
  if (!user) throw new Error(`No demo user with role ${role}`);
  const userInfo = user;
  const token = await encrypt({
    userId: userInfo.id,
    role,
    displayName: userInfo.display_name,
  });
  (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: () => ({ value: token }),
  });
}

describe('cockpit server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Admin session: refreshAuditFeed returns rows without an actorUserId filter', async () => {
    await mockSessionFor('Admin');
    const { entries } = await refreshAuditFeed({ limit: 50 });
    // Admin sees all rows (filter: undefined). Length depends on shared DB
    // state, but the call must succeed without throwing.
    expect(Array.isArray(entries)).toBe(true);
  });

  it('Editor session: refreshAuditFeed returns rows filtered to own actorUserId', async () => {
    await mockSessionFor('Editor');
    const { entries } = await refreshAuditFeed({ limit: 50 });
    const editor = DEMO_USERS.find((u) => u.role === 'Editor');
    if (!editor) throw new Error('Editor demo user not seeded');
    // Every returned row must have actor_user_id matching the Editor's id.
    for (const row of entries) {
      expect(row.actor_user_id).toBe(editor.id);
    }
  });

  it('Creator session: every action throws (requireOperator gate)', async () => {
    await mockSessionFor('Creator');
    await expect(refreshAuditFeed({ limit: 50 })).rejects.toThrow(/Forbidden/);
    await expect(refreshSchedule({ limit: 50 })).rejects.toThrow(/Forbidden/);
    await expect(refreshApprovals({ limit: 50 })).rejects.toThrow(/Forbidden/);
    await expect(refreshSpend()).rejects.toThrow(/Forbidden/);
    await expect(refreshEvalHealth()).rejects.toThrow(/Forbidden/);
  });

  it('Editor session: refreshApprovals throws (requireAdmin gate, distinct from requireOperator)', async () => {
    await mockSessionFor('Editor');
    await expect(refreshApprovals({ limit: 50 })).rejects.toThrow(/Forbidden/);
    // Editor is allowed for the other actions — verify the gate is specifically Approvals.
    await expect(refreshSchedule({ limit: 50 })).resolves.toBeDefined();
  });
});
