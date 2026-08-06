import { cookies } from 'next/headers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  // Sprint A.3 (#3) — switchRole reads LEASELENS_DEMO_MODE at call time, so
  // snapshot/restore it per-test (vitest shares process.env across files; a
  // leaked 'true' would weaken the production-safety gate in sibling suites).
  let priorDemoMode: string | undefined;
  beforeEach(() => {
    vi.clearAllMocks();
    priorDemoMode = process.env.LEASELENS_DEMO_MODE;
    process.env.LEASELENS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
  });
  afterEach(() => {
    if (priorDemoMode === undefined) delete process.env.LEASELENS_DEMO_MODE;
    else process.env.LEASELENS_DEMO_MODE = priorDemoMode;
  });

  it('should set the session cookie for a valid role (demo mode on)', async () => {
    process.env.LEASELENS_DEMO_MODE = 'true';
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
    process.env.LEASELENS_DEMO_MODE = 'true';
    // Need to cast to any to bypass TS for the test
    await expect(switchRole('InvalidRole' as unknown as Role)).rejects.toThrow(
      'Invalid role: InvalidRole',
    );

    const cookieStore = await cookies();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  // Sprint A.3 (#3) — hidden UI is not a security boundary (Robert C. Martin:
  // authorization at the server boundary). Reviewer/Admin bypass tenant
  // ownership in assert-lease-ownership, so a public/anonymous deploy
  // (demo mode off) must NEVER mint a privileged role cookie.
  it('rejects the role switch when demo mode is off (production safety)', async () => {
    process.env.LEASELENS_DEMO_MODE = 'false';
    await expect(switchRole('Admin')).rejects.toThrow(/demo mode/i);

    const cookieStore = await cookies();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('rejects the role switch when demo mode is unset (fail closed)', async () => {
    delete process.env.LEASELENS_DEMO_MODE;
    await expect(switchRole('Reviewer')).rejects.toThrow(/demo mode/i);

    const cookieStore = await cookies();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
