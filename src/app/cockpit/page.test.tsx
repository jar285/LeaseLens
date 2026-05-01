import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/components/cockpit/CockpitDashboard', () => ({
  CockpitDashboard: ({
    initialData,
  }: {
    initialData: { role: string; approvals: unknown[] };
  }) => (
    <div
      data-testid="dashboard-stub"
      data-role={initialData.role}
      data-approvals-count={initialData.approvals.length}
    />
  ),
}));

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

async function mockCookieFor(
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
  const token = await encrypt({
    userId: user.id,
    role,
    displayName: user.display_name,
  });
  (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: () => ({ value: token }),
  });
}

describe('CockpitPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to / when there is no cookie', async () => {
    await mockCookieFor(null);
    const CockpitPage = (await import('./page')).default;
    await expect(CockpitPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('redirects to / when the session decrypts to Creator role', async () => {
    await mockCookieFor('Creator');
    const CockpitPage = (await import('./page')).default;
    await expect(CockpitPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('renders the dashboard for Editor session with empty approvals', async () => {
    await mockCookieFor('Editor');
    const CockpitPage = (await import('./page')).default;
    const tree = await CockpitPage();
    // Render output is a JSX element tree; no React renderer in this test
    // env, but we can introspect props via the mocked CockpitDashboard.
    // Walk the tree to find the dashboard stub's props.
    const stubProps = findStubProps(tree);
    expect(stubProps?.role).toBe('Editor');
    expect(stubProps?.approvals).toEqual([]);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('renders the dashboard for Admin session with approvals available', async () => {
    await mockCookieFor('Admin');
    const CockpitPage = (await import('./page')).default;
    const tree = await CockpitPage();
    const stubProps = findStubProps(tree);
    expect(stubProps?.role).toBe('Admin');
    // approvals is an array (length depends on shared DB state — just type check)
    expect(Array.isArray(stubProps?.approvals)).toBe(true);
    expect(redirect).not.toHaveBeenCalled();
  });
});

/**
 * Walks a React element tree and returns the initialData prop of the
 * CockpitDashboard mock when found. The mock is keyed on `data-testid`
 * via its rendered `<div>`; here we read the JSX prop directly off the
 * unrendered element, which is structurally accessible since React trees
 * are plain objects.
 */
function findStubProps(
  node: unknown,
): { role: string; approvals: unknown[] } | null {
  if (!node || typeof node !== 'object') return null;
  const elem = node as {
    type?: unknown;
    props?: { initialData?: { role: string; approvals: unknown[] } };
    children?: unknown;
  };
  if (elem.props?.initialData) {
    return {
      role: elem.props.initialData.role,
      approvals: elem.props.initialData.approvals,
    };
  }
  // Recurse into children
  const props = elem.props as Record<string, unknown> | undefined;
  if (props) {
    for (const value of Object.values(props)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          const found = findStubProps(v);
          if (found) return found;
        }
      } else {
        const found = findStubProps(value);
        if (found) return found;
      }
    }
  }
  return null;
}
