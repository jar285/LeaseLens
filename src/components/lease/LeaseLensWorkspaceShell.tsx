// Sprint 13 §3f / Phase 10 — three-pane client shell.
//
// Composition root for the LeaseLens chat home. Wraps everything in a
// ChatStreamProvider so the right pane (RedFlagReport) and the left
// pane (PdfViewer) share state with the middle pane's ChatUI:
//
//   left   — LeaseUploadDropzone (no lease) ↔ PdfViewer (lease loaded)
//   center — ChatUI (forwards tool events into the context)
//   right  — RedFlagReport
//
// Below 1024px the panes flex-wrap (incidental per spec §3f; mobile
// is explicitly out of scope per §7).
//
// Phase 10.5 — scroll containment chain. Each pane is its own
// `flex-1 min-h-0 flex-col overflow-hidden` so its child decides how
// to scroll (PdfViewer scrolls a paged document; ChatUI scrolls the
// transcript; the right rail scrolls red-flag cards). The inline
// `min-width` styles on the left/right panes only matter on narrow
// viewports where flex-wrap kicks in — they keep the wrapped panes
// from collapsing past readable widths.

'use client';

import { useState } from 'react';
import {
  ChatStreamProvider,
  type ToolEvent,
  useChatStream,
} from '@/components/chat/ChatStreamContext';
import {
  type ChatToolEvent,
  ChatUI,
  type ChatUIProps,
} from '@/components/chat/ChatUI';
import { ResizableSplitLayout } from '@/components/layout/ResizableSplitLayout';
import type { Role } from '@/lib/auth/types';
import { LeaseUploadDropzone, type UploadResult } from './LeaseUploadDropzone';
import { PdfViewer } from './PdfViewer';
import { RedFlagReport } from './RedFlagReport';
import { RedFlagsPaneHeader } from './RedFlagsPaneHeader';

export interface LeaseLensWorkspaceShellProps {
  initialMessages: ChatUIProps['initialMessages'];
  conversationId: ChatUIProps['conversationId'];
  workspaceName: ChatUIProps['workspaceName'];
  /**
   * Sprint 18 §5 — viewer role from the server-rendered page. Threads
   * straight into `ChatStreamProvider` so descendants (`ChatMessage`,
   * future `ScanTimeline`) can branch tenant-friendly vs. trace-fidelity
   * rendering. Defaults to `Creator` (the most-restrictive, tenant view)
   * if a caller forgets to pass it.
   */
  viewerRole?: Role;
}

interface ActiveLease extends UploadResult {
  pdfUrl: string;
  filename: string;
}

export function LeaseLensWorkspaceShell(
  props: LeaseLensWorkspaceShellProps,
): React.JSX.Element {
  return (
    <ChatStreamProvider viewerRole={props.viewerRole}>
      <ShellInner {...props} />
    </ChatStreamProvider>
  );
}

function ShellInner({
  initialMessages,
  conversationId,
  workspaceName,
}: LeaseLensWorkspaceShellProps): React.JSX.Element {
  const { pushToolEvent, setActiveLease: setContextLease } = useChatStream();
  const [activeLease, setActiveLease] = useState<ActiveLease | null>(null);

  function handleUploaded(result: UploadResult, file: File): void {
    // Hold the PDF as a Blob URL for the viewer. Per spec H4 the binary
    // is intentionally not persisted — on refresh the user re-uploads.
    // Sprint 23b Phase 6.2 — the File is now forwarded by the dropzone
    // explicitly (both click and drag paths), so the prior 'blob:placeholder'
    // fallback that left the viewer in an error state on drag-drop is gone.
    const pdfUrl = URL.createObjectURL(file);
    const filename = file.name;
    setActiveLease({ ...result, pdfUrl, filename });
    // S19.3 — also surface the narrative-relevant fields on the chat
    // context so useScanNarrative / ChatEmptyState can render the
    // synthetic "Lease uploaded" intro and the post-scan summary.
    // Sprint 23c Phase 2 — also forward the page/clause counts so the
    // new UploadedLeaseCard can render the meta line.
    setContextLease({
      lease_id: result.lease_id,
      filename,
      page_count: result.page_count,
      clause_count: result.clause_count,
    });
  }

  function handleToolEvent(event: ChatToolEvent): void {
    const toolEvent: ToolEvent = {
      tool_name: event.tool_name,
      input: event.input,
      result: event.result,
      audit_id: event.audit_id,
    };
    pushToolEvent(toolEvent);
  }

  // S20.3 — layout is delegated to ResizableSplitLayout, which owns
  // the grid template, the CSS-var pane widths, and the drag handles.
  // The shell stays responsible for which content lives in each slot.
  const leftSlot = (
    <section
      data-testid="shell-left-pane"
      className="hidden h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-neutral-100 bg-surface-card dark:border-neutral-800 dark:bg-neutral-900 lg:flex"
    >
      {activeLease ? (
        <PdfViewer
          pdfUrl={activeLease.pdfUrl}
          filename={activeLease.filename}
          pageCount={activeLease.page_count}
          clauseCount={activeLease.clause_count}
        />
      ) : (
        <UploadColumn
          conversationId={conversationId ?? null}
          onUploaded={handleUploaded}
        />
      )}
    </section>
  );

  const centreSlot = (
    <section
      data-testid="shell-center-pane"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface-card dark:bg-neutral-900"
    >
      <ChatUI
        initialMessages={initialMessages}
        conversationId={conversationId}
        workspaceName={workspaceName}
        onToolEvent={handleToolEvent}
      />
    </section>
  );

  const rightSlot = (
    <aside
      data-testid="shell-right-pane"
      className="hidden h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-neutral-100 bg-surface-base dark:border-neutral-800 dark:bg-neutral-950 lg:flex"
      aria-label="Red-flag report"
    >
      <RedFlagsPaneHeader />
      <div
        data-testid="shell-right-pane-scroll-area"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"
      >
        <RedFlagReport />
      </div>
    </aside>
  );

  return (
    <ResizableSplitLayout
      rootTestId="shell-root"
      dataShellRouteMode="three-pane"
      left={leftSlot}
      centre={centreSlot}
      right={rightSlot}
    />
  );
}

function UploadColumn({
  conversationId,
  onUploaded,
}: {
  conversationId: string | null;
  onUploaded: (result: UploadResult, file: File) => void;
}): React.JSX.Element {
  // Sprint 23b Phase 6.2 — straight forward: the dropzone now passes the
  // File as the second arg to its onUploaded callback (for both click
  // and drag paths), so we don't need to sniff it from the DOM input.
  return (
    <div className="flex h-full min-h-0 flex-col items-stretch gap-3 p-6">
      <LeaseUploadDropzone
        onUploaded={onUploaded}
        conversationId={conversationId}
      />
    </div>
  );
}
