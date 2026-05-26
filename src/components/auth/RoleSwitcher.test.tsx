// Phase 10.8 — RoleSwitcher relocated from a floating bottom-right
// button group into the global header as a segmented control. These
// tests pin the architectural decision so a future refactor cannot
// silently regress to the floating overlap that hid red-flag cards.
//
// S19.1 — role values became the labels (Tenant/Reviewer/Admin);
// the label-bridge has been removed, and the title-attribute that
// exposed the DB literal is gone with it.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const switchRoleMock = vi.fn().mockResolvedValue(undefined);
const refreshMock = vi.fn();

vi.mock('@/lib/auth/actions', () => ({
  switchRole: (...args: unknown[]) => switchRoleMock(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { RoleSwitcher } from './RoleSwitcher';

afterEach(() => {
  cleanup();
  switchRoleMock.mockClear();
  refreshMock.mockClear();
});

describe('RoleSwitcher', () => {
  it('renders one button per role, labeled with the LeaseLens role name', () => {
    render(<RoleSwitcher currentRole="Tenant" />);
    expect(screen.getByTestId('role-switcher-tenant')).toHaveTextContent(
      /tenant/i,
    );
    expect(screen.getByTestId('role-switcher-reviewer')).toHaveTextContent(
      /reviewer/i,
    );
    expect(screen.getByTestId('role-switcher-admin')).toHaveTextContent(
      /admin/i,
    );
  });

  it('marks the currently active role via data-active="true"', () => {
    render(<RoleSwitcher currentRole="Reviewer" />);
    expect(screen.getByTestId('role-switcher-reviewer')).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(screen.getByTestId('role-switcher-tenant')).toHaveAttribute(
      'data-active',
      'false',
    );
    expect(screen.getByTestId('role-switcher-admin')).toHaveAttribute(
      'data-active',
      'false',
    );
  });

  it('uses an inline group container — NOT fixed bottom-right', () => {
    // Phase 10.8 contract: the previous floating chrome
    // (`fixed bottom-4 right-4 z-50`) overlapped the last red-flag
    // card. Lock the new placement so a refactor cannot reintroduce
    // the overlap silently.
    render(<RoleSwitcher currentRole="Tenant" />);
    const root = screen.getByTestId('role-switcher');
    expect(root.className).not.toMatch(/\bfixed\b/);
    expect(root.className).not.toMatch(/bottom-4/);
    expect(root.getAttribute('role')).toBe('group');
    expect(root.getAttribute('aria-label')).toBe('Switch role');
  });

  // Sprint 25.1 (R1) — soft re-render via router.refresh() replaces
  // the prior revalidatePath path. Pin the new contract: clicking a
  // role calls switchRole AND then router.refresh().
  it('calls switchRole then router.refresh() when a role is clicked', async () => {
    render(<RoleSwitcher currentRole="Tenant" />);
    fireEvent.click(screen.getByTestId('role-switcher-reviewer'));

    // The switchRole call is awaited inside startTransition; flush
    // microtasks so the chained refresh() can resolve.
    await Promise.resolve();
    await Promise.resolve();

    expect(switchRoleMock).toHaveBeenCalledWith('Reviewer');
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});
