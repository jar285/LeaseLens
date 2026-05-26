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

import { useEffect } from 'react';
import { AssistantFabProvider } from '@/components/chat/AssistantFabContext';
import {
  type ActiveLeaseRef,
  ChatStreamProvider,
  type ToolEvent,
} from '@/components/chat/ChatStreamContext';
import {
  type ChatToolEvent,
  ChatUI,
  type ChatUIProps,
} from '@/components/chat/ChatUI';
import { ResizableSplitLayout } from '@/components/layout/ResizableSplitLayout';
import type { Role } from '@/lib/auth/types';
import { getPdfBinaryRepository } from '@/lib/lease/pdf-binary-repository';
import { LeaseParserProvider, useLeaseParser } from './LeaseParserContext';
import { LeaseUploadDropzone, type UploadResult } from './LeaseUploadDropzone';
import { PdfViewer } from './PdfViewer';
import { RedFlagReport } from './RedFlagReport';
import { RedFlagsPaneHeader } from './RedFlagsPaneHeader';
import { type LeftPaneState, useLeftPaneState } from './useLeftPaneState';

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
  /**
   * Sprint 25 — server-rehydrated tool events (paired tool_use/tool_result
   * rows from the persisted conversation). Seeds ChatStreamProvider so
   * the right-pane RedFlagReport reappears after role switch or cockpit
   * navigation instead of dropping to the empty state.
   */
  initialToolEvents?: ToolEvent[];
  /**
   * Sprint 25 — server-rehydrated active-lease metadata
   * (`{ lease_id, filename, page_count, clause_count }`). The Blob URL
   * itself is restored client-side from IndexedDB; see
   * PdfBinaryRepository + useLeftPaneState.
   */
  initialActiveLease?: ActiveLeaseRef | null;
}

export function LeaseLensWorkspaceShell(
  props: LeaseLensWorkspaceShellProps,
): React.JSX.Element {
  // Sprint 26c — RedFlagReport now consumes useAssistantFab. The legacy
  // shell is no longer mounted by the page router (the router uses
  // ParserResultsShell in 26b+), but we still wrap in
  // AssistantFabProvider so any direct consumer (tests, snapshot
  // probes) keeps working until the shell is deleted in Sprint 26d.
  return (
    <AssistantFabProvider>
      <LeaseParserProvider
        initialEvents={props.initialToolEvents}
        activeLease={props.initialActiveLease ?? null}
      >
        <ChatStreamProvider viewerRole={props.viewerRole}>
          <ShellInner {...props} />
        </ChatStreamProvider>
      </LeaseParserProvider>
    </AssistantFabProvider>
  );
}

function ShellInner({
  initialMessages,
  conversationId,
  workspaceName,
}: LeaseLensWorkspaceShellProps): React.JSX.Element {
  // Sprint 24.7 — `activeLease` now lives entirely on ChatStreamContext.
  // Previously a parallel `ShellInner.activeLease` state held the
  // Blob URL + filename and gated the dropzone-vs-viewer swap; that
  // duplicated state was the root cause of "New conversation leaves
  // lease attached" — `ChatUI.handleNewConversation` only had a
  // setter for the context shape, never the local one. Collapsing to
  // a single source of truth makes the reset one call.
  const { appendToolEvent, activeLease, setActiveLease } = useLeaseParser();
  const leftPaneState = useLeftPaneState();

  // Sprint 25 — evict stale entries on mount so the cache stays bounded.
  // The current lease is retained; everything else is dropped.
  //
  // Sprint 25.2 — guard against the "no active lease" case. The earlier
  // implementation called evictExcept([]) when activeLease was null,
  // which wiped EVERY entry in the global IDB store — breaking Sprint
  // 25's transparent restore for OTHER sessions (e.g. switching to a
  // role with no conversation, then back, lost the prior user's
  // cached PDF). If we have no lease to keep on this mount, leave the
  // cache alone; the next mount with an active lease will prune then.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot mount eviction; intentionally ignores activeLease changes so a mid-session swap doesn't drop bytes the user might undo back to
  useEffect(() => {
    if (!activeLease) return;
    void getPdfBinaryRepository()
      .evictExcept([activeLease.lease_id])
      .catch(() => {});
  }, []);

  function handleUploaded(result: UploadResult, file: File): void {
    // Hold the PDF as a Blob URL for the viewer. Per spec H4 the binary
    // is intentionally not persisted *server-side* — but Sprint 25
    // caches it locally in IndexedDB so role-switch / cockpit-nav
    // round-trips don't force a re-upload. See pdf-binary-repository.ts
    // for the boundary note.
    setActiveLease({
      lease_id: result.lease_id,
      filename: file.name,
      page_count: result.page_count,
      clause_count: result.clause_count,
      pdfUrl: URL.createObjectURL(file),
    });
    // Fire-and-forget; the user already sees the PDF via the just-
    // created Blob URL, so failure to cache is non-blocking.
    void getPdfBinaryRepository()
      .put(result.lease_id, file)
      .catch(() => {});
  }

  function handleToolEvent(event: ChatToolEvent): void {
    const toolEvent: ToolEvent = {
      tool_name: event.tool_name,
      input: event.input,
      result: event.result,
      audit_id: event.audit_id,
    };
    appendToolEvent(toolEvent);
  }

  // S20.3 — layout is delegated to ResizableSplitLayout, which owns
  // the grid template, the CSS-var pane widths, and the drag handles.
  // The shell stays responsible for which content lives in each slot.
  // Sprint 25 — left slot is now a switch on the LeftPaneState machine,
  // so empty / restoring / loaded / reattach are explicit and impossible
  // states (e.g. restoring + loaded) are unrepresentable.
  const leftSlot = (
    <section
      data-testid="shell-left-pane"
      data-left-pane-state={leftPaneState.kind}
      className="hidden h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-neutral-100 bg-surface-card dark:border-neutral-800 dark:bg-neutral-900 lg:flex"
    >
      {renderLeftPane(leftPaneState, {
        conversationId: conversationId ?? null,
        onUploaded: handleUploaded,
      })}
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

/**
 * Sprint 25 — left-pane renderer. Pure switch on the state machine.
 * Lives outside the component so the switch is exhaustive (the type
 * system will flag a missing branch with `Type 'X' is not assignable
 * to type 'never'`).
 */
function renderLeftPane(
  state: LeftPaneState,
  ctx: {
    conversationId: string | null;
    onUploaded: (result: UploadResult, file: File) => void;
  },
): React.JSX.Element {
  switch (state.kind) {
    case 'empty':
      return (
        <UploadColumn
          conversationId={ctx.conversationId}
          onUploaded={ctx.onUploaded}
        />
      );
    case 'loaded':
      return (
        <PdfViewer
          pdfUrl={state.pdfUrl}
          filename={state.filename}
          pageCount={state.pageCount}
          clauseCount={state.clauseCount}
        />
      );
    case 'restoring':
      return (
        <div
          data-testid="left-pane-restoring"
          className="flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6 text-center"
        >
          <p className="text-sm font-medium text-fg-default">
            Restoring {state.filename}…
          </p>
          <p className="text-xs text-fg-muted">
            Re-attaching the PDF from your browser cache.
          </p>
        </div>
      );
    case 'reattach':
      return (
        <div
          data-testid="left-pane-reattach"
          className="flex h-full min-h-0 flex-col items-stretch gap-3 p-6"
        >
          <div className="space-y-1 text-center">
            <p className="text-sm font-medium text-fg-default">
              Re-attach {state.lease.filename}
            </p>
            <p className="text-xs text-fg-muted">
              Your analysis is preserved — the PDF needs to be re-uploaded so
              the viewer can show it again.
            </p>
          </div>
          <LeaseUploadDropzone
            onUploaded={ctx.onUploaded}
            conversationId={ctx.conversationId}
          />
        </div>
      );
  }
}
