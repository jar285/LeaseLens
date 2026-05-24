// Sprint 26a — workspace router shell.
//
// Pure client-side switch between Mode A (ParserLandingShell) and Mode B
// (LeaseLensWorkspaceShell). Sprint 26b replaces the Mode B branch with
// ParserResultsShell; Sprint 26c then removes the FAB stub and wires the
// real assistant.
//
// The router holds a small piece of state so an in-session upload from
// Mode A transitions to Mode B without a full page refresh. The SSR
// decision input — `initialActiveLease` — comes from the DB (rehydrated
// in src/app/page.tsx) and seeds the local state on mount; subsequent
// uploads update only the local state. This preserves the legacy
// LeaseLensWorkspaceShell's "no-remount on lease swap" behavior because
// Mode B owns its own ChatStreamProvider once mounted.

'use client';

import { useState } from 'react';
import type {
  ActiveLeaseRef,
  ToolEvent,
} from '@/components/chat/ChatStreamContext';
import type { ChatUIProps } from '@/components/chat/ChatUI';
import type { Role } from '@/lib/auth/types';
import { getPdfBinaryRepository } from '@/lib/lease/pdf-binary-repository';
import type { UploadResult } from './LeaseUploadDropzone';
import { ParserLandingShell } from './ParserLandingShell';
import { ParserResultsShell } from './ParserResultsShell';

export interface WorkspaceRouterShellProps {
  initialMessages: ChatUIProps['initialMessages'];
  conversationId: ChatUIProps['conversationId'];
  workspaceName: ChatUIProps['workspaceName'];
  viewerRole?: Role;
  initialToolEvents?: ToolEvent[];
  initialActiveLease?: ActiveLeaseRef | null;
  /**
   * Sprint 26c.10 — server-side env flag (`LEASELENS_AUTO_SCAN_ENABLED`)
   * threaded through from src/app/page.tsx. When false, the router
   * never asks ParserResultsShell to auto-fire the scan even on fresh
   * Mode A uploads. Defaults to false at the type level; the page
   * forwards `env.LEASELENS_AUTO_SCAN_ENABLED` so the production
   * default is on.
   */
  autoScanEnabled?: boolean;
}

export function WorkspaceRouterShell(
  props: WorkspaceRouterShellProps,
): React.JSX.Element {
  // Sprint 26a — local override so an in-session Mode A upload lifts the
  // user into Mode B without a hard refresh. Seeded by the server-rendered
  // initialActiveLease; mutated only on dropzone success.
  const [liveActiveLease, setLiveActiveLease] = useState<ActiveLeaseRef | null>(
    props.initialActiveLease ?? null,
  );
  // Sprint 26c.9 — tracks whether the active lease came from a fresh
  // Mode A upload in THIS session, vs. SSR rehydration of an existing
  // conversation. On a fresh upload we drop the rehydrated tool events
  // entirely; on SSR rehydration we forward them so prior gradings
  // come back into view.
  const [freshUpload, setFreshUpload] = useState(false);

  function handleUploadedFromLanding(result: UploadResult, file: File): void {
    setLiveActiveLease({
      lease_id: result.lease_id,
      filename: file.name,
      page_count: result.page_count,
      clause_count: result.clause_count,
      pdfUrl: URL.createObjectURL(file),
    });
    setFreshUpload(true);
    // Sprint 25 — cache PDF binary in IndexedDB so role-switch / cockpit
    // round-trips restore the loaded state without forcing a re-upload.
    // Mirrors the legacy LeaseLensWorkspaceShell.handleUploaded behavior;
    // fire-and-forget because the in-memory Blob URL already drives the
    // viewer and IDB failure is non-blocking.
    void getPdfBinaryRepository()
      .put(result.lease_id, file)
      .catch(() => {});
  }

  function handleReplace(): void {
    setLiveActiveLease(null);
    // Reset the fresh-upload flag so a subsequent upload from Mode A is
    // treated as fresh again, and a subsequent SSR rehydration (if it
    // occurs) is treated as a rehydration.
    setFreshUpload(false);
  }

  if (!liveActiveLease) {
    return (
      <ParserLandingShell
        workspaceName={props.workspaceName}
        viewerRole={props.viewerRole}
        conversationId={props.conversationId ?? null}
        onUploaded={handleUploadedFromLanding}
      />
    );
  }

  // Sprint 26b — post-upload routes to ParserResultsShell. The legacy
  // LeaseLensWorkspaceShell stays in the codebase as a fallback until
  // Sprint 26d's cleanup pass.
  //
  // Sprint 26c.9 — on a fresh in-session upload, pass an empty tool-
  // events array so RedFlagReport and ClausesList start clean (no
  // stale rehydrated cards from the prior conversation's lease).
  const initialToolEvents = freshUpload ? [] : (props.initialToolEvents ?? []);

  // Sprint 26c.10 — auto-scan only fires on a fresh in-session
  // upload AND when the server env flag is on. SSR rehydration of a
  // prior conversation does not auto-fire (the user already saw
  // results last time).
  const triggerAutoScan = freshUpload && props.autoScanEnabled === true;

  return (
    <ParserResultsShell
      initialMessages={props.initialMessages}
      conversationId={props.conversationId}
      workspaceName={props.workspaceName}
      viewerRole={props.viewerRole}
      initialToolEvents={initialToolEvents}
      initialActiveLease={liveActiveLease}
      onReplace={handleReplace}
      triggerAutoScan={triggerAutoScan}
    />
  );
}
