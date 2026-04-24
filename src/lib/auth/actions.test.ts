import { revalidatePath } from 'next/cache';
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('switchRole Server Action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CONTENTOPS_SESSION_SECRET =
      'a-very-long-test-secret-that-is-at-least-32-chars';
  });

  it('should set the session cookie and revalidate path for a valid role', async () => {
    await switchRole('Editor');

    // Verify cookie store was awaited and set was called
    const cookieStore = await cookies();
    expect(cookieStore.set).toHaveBeenCalledTimes(1);

    // Check the arguments passed to set()
    const [name, token, options] = vi.mocked(cookieStore.set).mock.calls[0];
    expect(name).toBe('contentops_session');
    expect(options).toMatchObject({
      httpOnly: true,
      path: '/',
      maxAge: 86400,
    });

    // Verify token content
    expect(token).toBeDefined();
    const payload = await decrypt(token as string);
    const expectedUser = DEMO_USERS.find((u) => u.role === 'Editor');
    expect(payload).toMatchObject({
      userId: expectedUser?.id,
      role: 'Editor',
      displayName: expectedUser?.display_name,
    });

    // Verify revalidatePath
    expect(revalidatePath).toHaveBeenCalledWith('/');
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it('should throw an error for an invalid role', async () => {
    // Need to cast to any to bypass TS for the test
    await expect(switchRole('InvalidRole' as unknown as Role)).rejects.toThrow(
      'Invalid role: InvalidRole',
    );

    const cookieStore = await cookies();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
