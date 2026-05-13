// Phase 10.8 — header-friendly segmented control. Replaces the
// previous floating bottom-right button group, which overlapped the
// red-flags panel and made the last card hard to reach.
//
// Sprint 15 Phase 2 — animated pill underlay via motion's `layoutId`.
// One `motion.span` is rendered behind the active button; when the
// active role changes, Framer auto-animates its position between the
// three slots. Reduced-motion: render a plain background span
// (instant position swap, no slide).
//
// S19.1 — role values are the labels (Tenant / Reviewer / Admin);
// the label-bridge has been removed. The DB-layer codec lives in
// role-codec.ts and is the boundary's responsibility.

'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState, useTransition } from 'react';
import { switchRole } from '@/lib/auth/actions';
import type { Role } from '@/lib/auth/types';

const ROLES: Role[] = ['Tenant', 'Reviewer', 'Admin'];

export function RoleSwitcher({ currentRole }: { currentRole: Role }) {
  const [isPending, startTransition] = useTransition();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleRoleSwitch = (role: Role) => {
    startTransition(() => {
      switchRole(role);
    });
  };

  const animatePill = mounted && !reduced;

  return (
    // biome-ignore lint/a11y/useSemanticElements: segmented role selector has no semantic HTML equivalent (fieldset is form-only, menu is a command list). role="group" + aria-label is the canonical WAI-ARIA pattern.
    <div
      data-testid="role-switcher"
      role="group"
      aria-label="Switch role"
      className="inline-flex items-center gap-0.5 rounded-md border border-neutral-200 bg-white p-0.5 dark:border-neutral-800 dark:bg-neutral-900"
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
            className={`relative rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-1 ${
              isActive
                ? 'text-accent-700 dark:text-accent-300'
                : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
            } ${isPending ? 'opacity-50' : ''}`}
          >
            {isActive &&
              (animatePill ? (
                <motion.span
                  layoutId="role-pill"
                  aria-hidden="true"
                  // Sprint 15.2 — pointer-events-none so the pill (which
                  // covers the entire button via inset-0) can never
                  // intercept clicks meant for the button. Defensive:
                  // the role-switch bug at 5446c53 was a missing demo
                  // user, not a click swallow, but decorative absolute
                  // children blocking events is a classic regression.
                  className="pointer-events-none absolute inset-0 rounded-[5px] bg-accent-50 dark:bg-accent-500/15"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[5px] bg-accent-50 dark:bg-accent-500/15"
                />
              ))}
            <span className="relative">{role}</span>
          </button>
        );
      })}
    </div>
  );
}
