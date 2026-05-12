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
  const { pushToolEvent } = useChatStream();
  const [activeLease, setActiveLease] = useState<ActiveLease | null>(null);

  function handleUploaded(result: UploadResult, file?: File): void {
    // Hold the PDF as a Blob URL for the viewer. Per spec H4 the binary
    // is intentionally not persisted — on refresh the user re-uploads.
    const pdfUrl = file ? URL.createObjectURL(file) : 'blob:placeholder';
    const filename = file?.name ?? 'Lease document';
    setActiveLease({ ...result, pdfUrl, filename });
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

  return (
    // Phase 10.5 — explicit grid (no flex-wrap). With single-row flex-wrap
    // and default `align-content: normal`, each column was sizing to
    // CONTENT height instead of container height — defeating min-h-0
    // and breaking the scroll chain in every pane. A grid gives each
    // column an unambiguous "row" of full container height, and
    // min-h-0 + overflow-hidden on each <section> makes the inner
    // scroll regions take over. The grid itself takes flex-1 + min-h-0
    // so it consumes exactly the height its parent (page main) gives it.
    // Sprint 17 §5.7 — responsive minimum. Below `lg` (1024px) the
    // three-pane grid would force the side columns (20rem each = 640px)
    // to overflow on tablets and phones. For Sprint 17 the bar is "no
    // horizontal scroll"; the proper mobile layout (drawer / tabs)
    // lands in Sprint 18. Until then, hide the side panes on small
    // viewports and let the centre pane fill the width — the user can
    // still read the welcome state and send messages from any device.
    <div
      data-testid="shell-root"
      data-shell-route-mode="three-pane"
      className="grid min-h-0 w-full flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[20rem_minmax(0,1fr)_20rem]"
    >
      <section
        data-testid="shell-left-pane"
        className="hidden min-h-0 min-w-0 flex-col overflow-hidden border-r border-neutral-100 bg-surface-card dark:border-neutral-800 dark:bg-neutral-900 lg:flex"
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

      <section
        data-testid="shell-center-pane"
        className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface-card dark:bg-neutral-900"
      >
        <ChatUI
          initialMessages={initialMessages}
          conversationId={conversationId}
          workspaceName={workspaceName}
          onToolEvent={handleToolEvent}
        />
      </section>

      <aside
        data-testid="shell-right-pane"
        className="hidden min-h-0 min-w-0 flex-col overflow-hidden border-l border-neutral-100 bg-surface-base dark:border-neutral-800 dark:bg-neutral-950 lg:flex"
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
    </div>
  );
}

function UploadColumn({
  conversationId,
  onUploaded,
}: {
  conversationId: string | null;
  onUploaded: (result: UploadResult, file?: File) => void;
}): React.JSX.Element {
  // Wrap LeaseUploadDropzone so we can capture the File object alongside
  // the server response — the dropzone passes only the parsed UploadResult.
  // We sniff the most-recently-changed file from the input element.
  function handleUploaded(result: UploadResult): void {
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="lease-upload-input"]',
    );
    const file = input?.files?.[0];
    onUploaded(result, file ?? undefined);
  }

  return (
    <div className="flex h-full min-h-0 flex-col items-stretch gap-3 p-6">
      <LeaseUploadDropzone
        onUploaded={handleUploaded}
        conversationId={conversationId}
      />
    </div>
  );
}
