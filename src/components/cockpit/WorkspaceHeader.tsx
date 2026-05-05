import { WorkspaceMenu } from '@/components/workspaces/WorkspaceMenu';
import type { Workspace } from '@/lib/workspaces/types';

/**
 * Cockpit + home page header label showing the active workspace name and
 * a "Switch workspace" affordance. Sprint 11 (revised): the affordance
 * is now a popover (WorkspaceMenu) instead of a link to /onboarding.
 */
export function WorkspaceHeader({
  workspace,
  otherBrands,
}: {
  workspace: Workspace;
  otherBrands: Workspace[];
}) {
  return (
    <WorkspaceMenu
      workspaceName={workspace.name}
      isSample={Boolean(workspace.is_sample)}
      otherBrands={otherBrands}
    />
  );
}
