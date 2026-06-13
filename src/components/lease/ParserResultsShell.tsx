// Sprint 26b/26c — Mode-B composition root.
//
// Post-upload parser results layout. PDF on the left, results stack on
// the right (Red Flags → Clauses), AssistantFab anchored bottom-right.
// Replaces the legacy three-pane LeaseLensWorkspaceShell as the
// post-upload entry. Sprint 26c removed the temporary chat slot and
// wired the real FAB; chat now lives exclusively inside the FAB drawer.
//
// State: wraps its subtree in AssistantFabProvider + ChatStreamProvider
// with rehydrated tool events + active lease. The shell delegates the
// PDF/empty/reattach state machine to useLeftPaneState.

'use client';

import { FileText, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AssistantFab } from '@/components/chat/AssistantFab';
import { AssistantFabProvider } from '@/components/chat/AssistantFabContext';
import {
  type ActiveLeaseRef,
  ChatStreamProvider,
  type ToolEvent,
} from '@/components/chat/ChatStreamContext';
import type { ChatToolEvent, ChatUIProps } from '@/components/chat/ChatUI';
import type { Role } from '@/lib/auth/types';
import { getPdfBinaryRepository } from '@/lib/lease/pdf-binary-repository';
import { AutoScanRunner } from './AutoScanRunner';
import { ClausesList } from './ClausesList';
import { ConfirmDialog } from './ConfirmDialog';
import { LeaseParserProvider, useLeaseParser } from './LeaseParserContext';
import { PdfHighlightProvider } from './PdfHighlightContext';
import { PdfViewer } from './PdfViewer';
import { RedFlagReport } from './RedFlagReport';
import { RedFlagsPaneHeader } from './RedFlagsPaneHeader';
import { type LeftPaneState, useLeftPaneState } from './useLeftPaneState';

export interface ParserResultsShellProps {
  initialMessages: ChatUIProps['initialMessages'];
  conversationId: ChatUIProps['conversationId'];
  workspaceName: ChatUIProps['workspaceName'];
  viewerRole?: Role;
  initialToolEvents?: ToolEvent[];
  initialActiveLease: ActiveLeaseRef;
  /**
   * Sprint 26b — upward signal that the user clicked "Replace". The
   * router shell uses this to clear its liveActiveLease state and
   * return the page to Mode A. The shell also calls resetConversation()
   * locally so an isolated mount (e.g. in tests) visibly clears.
   */
  onReplace?: () => void;
  /**
   * Sprint 26c.10 — when true, mount AutoScanRunner so the standard
   * scan fires automatically on the active lease. The router shell
   * computes this as `freshUpload && env.LEASELENS_AUTO_SCAN_ENABLED`
   * — only fresh in-session uploads kick the scan; SSR rehydration
   * of an existing conversation does not re-fire.
   */
  triggerAutoScan?: boolean;
}

export function ParserResultsShell(
  props: ParserResultsShellProps,
): React.JSX.Element {
  // Sprint 28.6 — parser state lives in LeaseParserProvider now.
  // ChatStreamProvider keeps the same props for one sprint as inert
  // dead-state so any not-yet-migrated consumer still sees something
  // sensible. Sprint 4 drops the parser props from ChatStreamProvider.
  return (
    <AssistantFabProvider>
      <LeaseParserProvider
        initialEvents={props.initialToolEvents}
        activeLease={props.initialActiveLease}
      >
        {/* Sprint 46.3 — highlight UI state sits under the parser provider
            (so it can sit beside activeClauseId) and around the chat
            provider, without disturbing the pinned three-provider order. */}
        <PdfHighlightProvider>
          <ChatStreamProvider viewerRole={props.viewerRole}>
            <ResultsShellInner {...props} />
          </ChatStreamProvider>
        </PdfHighlightProvider>
      </LeaseParserProvider>
    </AssistantFabProvider>
  );
}

function ResultsShellInner({
  initialMessages,
  conversationId,
  workspaceName,
  onReplace,
  triggerAutoScan,
}: ParserResultsShellProps): React.JSX.Element {
  const { appendToolEvent, activeLease, resetParser } = useLeaseParser();
  const leftPaneState = useLeftPaneState();
  // Sprint 28.15 — Replace opens a styled in-app confirm instead of the
  // native window.confirm. Local boolean only: the dialog is a dumb presenter
  // and the destructive sequence stays in this orchestrator (Uncle Bob / DIP).
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Sprint 25 — cache eviction on mount mirrors the legacy shell so the
  // global IDB store stays bounded. The current lease is retained;
  // everything else is dropped. Guarded against the null lease case.
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot mount eviction
  useEffect(() => {
    if (!activeLease) return;
    void getPdfBinaryRepository()
      .evictExcept([activeLease.lease_id])
      .catch(() => {});
  }, []);

  function handleToolEvent(event: ChatToolEvent): void {
    appendToolEvent({
      tool_name: event.tool_name,
      input: event.input,
      result: event.result,
      audit_id: event.audit_id,
    });
  }

  // Sprint 28.9 — Replace is the destructive path that resets the entire
  // workspace (lease, extracted clauses, red flags). Don Norman: prevent
  // accidental destructive action by requiring an explicit confirm.
  // Sprint 28.15 — the intent-capture step now just opens the styled
  // ConfirmDialog (its copy names the three artifacts a first-time user is
  // about to lose); the destructive body below runs only on explicit confirm.
  function requestReplace(): void {
    setConfirmOpen(true);
  }

  function cancelReplace(): void {
    setConfirmOpen(false);
  }

  function confirmReplace(): void {
    setConfirmOpen(false);
    // Sprint 28.9 — Blob URL lifecycle moved here from ChatUI's
    // chat-thread reset (Sprint 4 removed that path). Revoke the
    // current lease's pdfUrl and evict its cached PDF bytes so the
    // resources are freed when the user explicitly opts in. Best-
    // effort; failures are non-actionable and silently ignored.
    if (activeLease?.pdfUrl) {
      try {
        URL.revokeObjectURL(activeLease.pdfUrl);
      } catch {
        // revokeObjectURL is best-effort and a no-op in jsdom tests.
      }
    }
    if (activeLease?.lease_id) {
      void getPdfBinaryRepository()
        .delete(activeLease.lease_id)
        .catch(() => {});
    }
    resetParser();
    onReplace?.();
  }

  return (
    <>
      <div
        data-testid="parser-results-shell"
        // Sprint 28.13 — window-scrolled workspace. The viewport-
        // clamp from Sprint 26c.10 (`flex max-h-full min-h-0 flex-1
        // flex-col overflow-hidden`) was correct under the old
        // "page must not scroll" spec but was reversed by user
        // request: the workspace now flows naturally as part of
        // window scroll. No height clamp, no overflow clipping.
        className="bg-surface-base"
      >
        <ResultsHeader
          leftPaneState={leftPaneState}
          onReplace={requestReplace}
        />
        {/* Sprint 28.13 — the responsive grid pattern from 28.10
            stays (PDF + cards side-by-side on lg+, stacked below)
            but it no longer owns height containment. Rows size to
            their content; the window handles scroll. */}
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2">
          <section
            data-testid="results-pdf-pane"
            data-state={leftPaneState.kind}
            // Sprint 28.14 — sticky-on-desktop PDF pane.
            //
            // After Sprint 28.13 switched the workspace to window
            // scroll, the grid row stretched to whichever pane was
            // taller. For a typical 15-section lease, the right
            // column (red flags + clauses list ≈ 2600px) dwarfs the
            // PDF (~1500px). The left cell stretched to the row
            // height and showed empty `bg-surface-card` below the
            // PDF — the "out of bounds" the user reported.
            //
            // Fix: `self-start` so the PDF cell doesn't stretch, and
            // at lg+ pin the pane sticky below the sticky header
            // with a viewport-bounded height. The bounded height
            // also restores PdfViewer's internal scroll chain
            // (`h-full + min-h-0 + flex-1 + overflow-auto`) so the
            // user pages through the PDF inside the sticky pane
            // while the right column scrolls past with the window.
            // Mobile (below lg) drops sticky entirely — the panes
            // stack and flow naturally for a single-column reader.
            className="self-start rounded-lg border border-neutral-200 bg-surface-card dark:border-neutral-800 dark:bg-neutral-900 lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:overflow-hidden"
            aria-label="Lease PDF"
          >
            <PdfPaneContent state={leftPaneState} />
          </section>
          <section
            data-testid="results-stack"
            // Sprint 28.13 — flow-positioned, no inner scroll. The
            // FAB-clearance scroll-padding-bottom from 28.11 is gone
            // because there is no inner scroll viewport anymore.
            className="flex flex-col gap-4"
            aria-label="Parser results"
          >
            <ResultsRedFlagsSection />
            <ClausesList />
          </section>
        </div>
      </div>
      <AssistantFab
        workspaceName={workspaceName}
        conversationId={conversationId ?? null}
        initialMessages={initialMessages}
        onToolEvent={handleToolEvent}
      />
      {/* Sprint 26c.10 — silent auto-scan. Renders nothing; just fires
          the standard scan on first mount when triggerAutoScan is true
          and the active lease has no extract event yet. tool_result
          events stream into ChatStreamContext via pushToolEvent, so
          RedFlagReport + ClausesList + ScanTimeline populate without
          opening the FAB. */}
      <AutoScanRunner
        enabled={triggerAutoScan === true}
        conversationId={conversationId ?? null}
      />
      {/* Sprint 28.15 — destructive-reset confirmation. The dialog is a dumb
          presenter; confirmReplace owns the revoke/evict/reset sequence. Copy
          names the three artifacts + irreversibility (carried from the old
          window.confirm). It must NOT borrow Clear-chat's "review preserved"
          string — this action destroys the review. */}
      <ConfirmDialog
        open={confirmOpen}
        title="Reset workspace?"
        description="This removes the uploaded lease, its extracted clauses, and all red flags. This cannot be undone."
        confirmLabel="Reset workspace"
        destructive
        onConfirm={confirmReplace}
        onCancel={cancelReplace}
      />
    </>
  );
}

function ResultsHeader({
  leftPaneState,
  onReplace,
}: {
  leftPaneState: LeftPaneState;
  onReplace: () => void;
}): React.JSX.Element {
  const meta = describeLease(leftPaneState);
  return (
    <header
      data-testid="results-header"
      className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-surface-card px-6 py-3 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex min-w-0 items-center gap-3">
        <FileText
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-fg-subtle"
        />
        <span
          data-testid="results-header-filename"
          className="truncate font-mono text-[12px] text-fg-default"
        >
          {meta.filename}
        </span>
        {meta.metaParts.length > 0 ? (
          <span
            data-testid="results-header-meta"
            className="hidden text-[11px] text-fg-subtle sm:inline"
          >
            · {meta.metaParts.join(' · ')}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        data-testid="results-replace-button"
        onClick={onReplace}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-surface-card px-2.5 py-1 text-[12px] font-medium text-fg-default transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
      >
        <RotateCcw aria-hidden="true" className="h-3 w-3" />
        Replace
      </button>
    </header>
  );
}

function describeLease(state: LeftPaneState): {
  filename: string;
  metaParts: string[];
} {
  if (state.kind === 'loaded') {
    const parts: string[] = [];
    if (typeof state.pageCount === 'number') {
      parts.push(
        `${state.pageCount} ${state.pageCount === 1 ? 'page' : 'pages'}`,
      );
    }
    if (typeof state.clauseCount === 'number') {
      parts.push(
        `${state.clauseCount} ${state.clauseCount === 1 ? 'clause' : 'clauses'}`,
      );
    }
    return { filename: state.filename, metaParts: parts };
  }
  if (state.kind === 'restoring' || state.kind === 'reattach') {
    const filename =
      state.kind === 'restoring' ? state.filename : state.lease.filename;
    return { filename, metaParts: [] };
  }
  return { filename: '—', metaParts: [] };
}

function PdfPaneContent({
  state,
}: {
  state: LeftPaneState;
}): React.JSX.Element {
  if (state.kind === 'loaded') {
    return (
      <PdfViewer
        pdfUrl={state.pdfUrl}
        filename={state.filename}
        pageCount={state.pageCount}
      />
    );
  }
  if (state.kind === 'restoring') {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fg-muted">
        Restoring {state.filename}…
      </div>
    );
  }
  if (state.kind === 'reattach') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm text-fg-default">{state.lease.filename}</p>
        <p className="text-xs text-fg-muted">
          We lost the cached file. Use Replace to re-upload it.
        </p>
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-fg-muted">
      No lease attached.
    </div>
  );
}

function ResultsRedFlagsSection(): React.JSX.Element {
  // No `overflow-hidden` here — the outer results-stack owns the scroll
  // container, and clipping at this level previously interacted with
  // Playwright's scrollIntoView on red-flag-card-toggle clicks (the
  // toggle's clip rect ended up under sibling section headers in
  // adjacent overflow-hidden boxes). Let the stack manage scroll
  // exclusively.
  return (
    <section
      data-testid="results-red-flags-section"
      className="flex flex-col rounded-lg border border-neutral-200 bg-surface-card dark:border-neutral-800 dark:bg-neutral-900"
    >
      <RedFlagsPaneHeader />
      <div className="flex flex-col gap-3 p-4">
        <RedFlagReport />
      </div>
    </section>
  );
}
