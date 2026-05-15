import { cookies } from 'next/headers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { switchRole } from './actions';
import { DEMO_USERS } from './constants';
import { decrypt } from './session';
import type { Role } from './types';

vi.mock('next/headers', () => {
  const setMock = vi.fn();
  return {
    cookies: vi.fn().mockResolvedValue({
      set: setMock,
    }),
  };
});

// Sprint 25.1 (R1) — switchRole no longer touches next/cache; the
// RoleSwitcher client component drives a soft re-render via
// router.refresh() instead. Mock + assertions for revalidatePath
// removed accordingly.

describe('switchRole Server Action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LEASELENS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
  });

  it('should set the session cookie for a valid role', async () => {
    await switchRole('Reviewer');

    // Verify cookie store was awaited and set was called
    const cookieStore = await cookies();
    expect(cookieStore.set).toHaveBeenCalledTimes(1);

    // Check the arguments passed to set()
    const [name, token, options] = vi.mocked(cookieStore.set).mock.calls[0];
    expect(name).toBe('leaselens_session');
    expect(options).toMatchObject({
      httpOnly: true,
      path: '/',
      maxAge: 86400,
    });

    // Verify token content
    expect(token).toBeDefined();
    const payload = await decrypt(token as string);
    const expectedUser = DEMO_USERS.find((u) => u.role === 'Reviewer');
    expect(payload).toMatchObject({
      userId: expectedUser?.id,
      role: 'Reviewer',
      displayName: expectedUser?.display_name,
    });
  });

  it('should throw an error for an invalid role', async () => {
    // Need to cast to any to bypass TS for the test
    await expect(switchRole('InvalidRole' as unknown as Role)).rejects.toThrow(
      'Invalid role: InvalidRole',
    );

    const cookieStore = await cookies();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
