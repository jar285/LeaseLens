// Phase 10.8 — RoleSwitcher relocated from a floating bottom-right
// button group into the global header as a segmented control. These
// tests pin the architectural decision so a future refactor cannot
// silently regress to the floating overlap that hid red-flag cards.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/actions', () => ({
  switchRole: vi.fn(),
}));

import { RoleSwitcher } from './RoleSwitcher';

afterEach(cleanup);

describe('RoleSwitcher', () => {
  it('renders one button per role, labeled with the LeaseLens UI label', () => {
    render(<RoleSwitcher currentRole="Creator" />);
    // labelFor() bridges DB literal Creator|Editor|Admin → UI label
    // Tenant|Reviewer|Admin. The DB literal stays in the title attr
    // for QA / admin debugging.
    expect(screen.getByTestId('role-switcher-creator')).toHaveTextContent(
      /tenant/i,
    );
    expect(screen.getByTestId('role-switcher-creator')).toHaveAttribute(
      'title',
      'Database role: Creator',
    );
    expect(screen.getByTestId('role-switcher-editor')).toHaveTextContent(
      /reviewer/i,
    );
    expect(screen.getByTestId('role-switcher-admin')).toHaveTextContent(
      /admin/i,
    );
  });

  it('marks the currently active role via data-active="true"', () => {
    render(<RoleSwitcher currentRole="Editor" />);
    expect(screen.getByTestId('role-switcher-editor')).toHaveAttribute(
      'data-active',
      'true',
    );
    expect(screen.getByTestId('role-switcher-creator')).toHaveAttribute(
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
    render(<RoleSwitcher currentRole="Creator" />);
    const root = screen.getByTestId('role-switcher');
    expect(root.className).not.toMatch(/\bfixed\b/);
    expect(root.className).not.toMatch(/bottom-4/);
    expect(root.getAttribute('role')).toBe('group');
    expect(root.getAttribute('aria-label')).toBe('Switch role');
  });
});
