'use client';

/**
 * Sprint 24.3 — switcher between the two seeded sample workspaces.
 *
 * - "LeaseLens — NJ Tenant Law" carries a deliberately red-flag-heavy
 *   lease (the original SAMPLE_WORKSPACE).
 * - "LeaseLens — NJ Clean Sample" carries a deliberately NJ-compliant
 *   lease (Sprint 24.3 addition).
 *
 * Clicking the link POSTs to the matching `/api/workspaces/select-*`
 * route, which rewrites the workspace cookie and 200s. The component
 * then `router.refresh()`s so the cockpit re-fetches every panel's
 * snapshot under the newly-active workspace. No full reload, no
 * client-state loss.
 *
 * Visible only when the cockpit is currently rendering one of the
 * two sample workspaces; absent on uploaded workspaces where the
 * "other sample" comparison isn't the right affordance.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  SAMPLE_CLEAN_WORKSPACE,
  SAMPLE_WORKSPACE,
} from '@/lib/workspaces/constants';

export interface SampleWorkspaceSwitcherProps {
  /** Workspace id currently rendering the cockpit. */
  currentWorkspaceId: string;
}

export function SampleWorkspaceSwitcher({
  currentWorkspaceId,
}: SampleWorkspaceSwitcherProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Pick the OTHER sample as the switch target. If the user is on
  // a non-sample workspace (uploaded), don't render — the comparison
  // doesn't apply.
  let target: { id: string; name: string; route: string };
  if (currentWorkspaceId === SAMPLE_WORKSPACE.id) {
    target = {
      id: SAMPLE_CLEAN_WORKSPACE.id,
      name: SAMPLE_CLEAN_WORKSPACE.name,
      route: '/api/workspaces/select-clean-sample',
    };
  } else if (currentWorkspaceId === SAMPLE_CLEAN_WORKSPACE.id) {
    target = {
      id: SAMPLE_WORKSPACE.id,
      name: SAMPLE_WORKSPACE.name,
      route: '/api/workspaces/select-sample',
    };
  } else {
    return null;
  }

  async function handleSwitch() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(target.route, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) {
        console.error('Workspace switch failed:', await res.text());
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      disabled={busy}
      data-testid="sample-workspace-switcher"
      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-surface-card px-2.5 py-1 font-mono text-[10px] tracking-[0.16em] text-fg-muted uppercase transition-colors hover:border-accent-300 hover:bg-accent-50/40 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-accent-400/40 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
    >
      <span aria-hidden="true">↺</span>
      Switch sample · {target.name}
    </button>
  );
}
