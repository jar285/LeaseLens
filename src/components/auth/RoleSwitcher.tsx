// Phase 10.8 — header-friendly segmented control. Replaces the
// previous floating bottom-right button group, which overlapped the
// red-flags panel and made the last card hard to reach. The DB role
// literal (Creator|Editor|Admin) stays the identity; the UI label
// (Tenant|Reviewer|Admin) is rendered via labelFor().

'use client';

import { useTransition } from 'react';
import { switchRole } from '@/lib/auth/actions';
import { labelFor } from '@/lib/auth/role-labels';
import type { Role } from '@/lib/auth/types';

const ROLES: Role[] = ['Creator', 'Editor', 'Admin'];

export function RoleSwitcher({ currentRole }: { currentRole: Role }) {
  const [isPending, startTransition] = useTransition();

  const handleRoleSwitch = (role: Role) => {
    startTransition(() => {
      switchRole(role);
    });
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: segmented role selector has no semantic HTML equivalent (fieldset is form-only, menu is a command list). role="group" + aria-label is the canonical WAI-ARIA pattern.
    <div
      data-testid="role-switcher"
      role="group"
      aria-label="Switch role"
      className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-white p-0.5"
    >
      {ROLES.map((role) => {
        const isActive = currentRole === role;
        return (
          <button
            key={role}
            type="button"
            data-testid={`role-switcher-${role.toLowerCase()}`}
            data-active={isActive ? 'true' : 'false'}
            onClick={() => handleRoleSwitch(role)}
            disabled={isPending}
            // Sprint 13 §3g — DB literal stays the role identity but
            // the displayed text is the LeaseLens label (Tenant /
            // Reviewer / Admin) via labelFor.
            title={`Database role: ${role}`}
            className={`rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-1 ${
              isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
            } ${isPending ? 'opacity-50' : ''}`}
          >
            {labelFor(role)}
          </button>
        );
      })}
    </div>
  );
}
