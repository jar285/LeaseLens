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
import { useEffect } from 'react';
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
import { LeaseParserProvider, useLeaseParser } from './LeaseParserContext';
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
        <ChatStreamProvider viewerRole={props.viewerRole}>
          <ResultsShellInner {...props} />
        </ChatStreamProvider>
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

  function handleReplace(): void {
    // Sprint 28.9 — Replace is the destructive path that resets the
    // entire workspace (lease, extracted clauses, red flags). Don
    // Norman: prevent accidental destructive action by requiring an
    // explicit confirm. The copy names the lease so a first-time user
    // understands what's about to be lost.
    const confirmed = window.confirm(
      'Reset workspace? This removes the uploaded lease, extracted clauses, and red flags. This cannot be undone.',
    );
    if (!confirmed) return;

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
        // Sprint 26c.9 — dropped `h-full` from this className. The
        // canonical chain in a flex-col parent (h-dvh main) is
        // `flex-1 min-h-0`; pairing it with `h-full` (height: 100%)
        // double-counts the header, causing the rendered DOM to be
        // 100dvh + headerH px tall and the window to scroll despite
        // `overflow-hidden` on main.
        //
        // Sprint 26c.10 — `<main>` switched to CSS grid; `max-h-full`
        // here is a belt-and-suspenders guard so even if a child
        // misbehaves it can't visually escape the grid row.
        className="flex max-h-full min-h-0 flex-1 flex-col overflow-hidden bg-surface-base"
      >
        <ResultsHeader
          leftPaneState={leftPaneState}
          onReplace={handleReplace}
        />
        {/* Sprint 28.10 — explicit grid model. Replaces the previous
            flex-col / lg:flex-row layout which leaked scroll height
            into the right pane on short content (Bug 1). The grid
            owns height containment via `min-h-0 overflow-hidden` and
            each cell is `flex-col h-full` so its child decides how
            to scroll. Single column below lg, two equal columns at
            lg+ — `grid-cols-1 lg:grid-cols-2` is more predictable
            than the flex-direction swap. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-2">
          <section
            data-testid="results-pdf-pane"
            data-state={leftPaneState.kind}
            className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-surface-card dark:border-neutral-800 dark:bg-neutral-900"
            aria-label="Lease PDF"
          >
            <PdfPaneContent state={leftPaneState} />
          </section>
          <section
            data-testid="results-stack"
            // Sprint 28.10 — the only scroll container in the body.
            // `pb-28` previously lived here as FAB clearance, but
            // that permanently inflated scrollHeight by 112px even
            // when content was short, leaving a blank scroll area
            // below the last card (Bug 1). The clearance now lives
            // as a sentinel inside this scroll stack, so it moves
            // with content height instead of being permanent.
            className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain"
            aria-label="Parser results"
          >
            <ResultsRedFlagsSection />
            <ClausesList />
            {/* Sprint 28.10 — FAB safe area sentinel. Lives inside
                the scroll stack as its last child so the user can
                scroll the last clause above the floating button
                when content overflows, but no permanent empty
                space appears when content is short. */}
            <div
              data-testid="results-stack-fab-safe-area"
              aria-hidden="true"
              className="h-28 shrink-0"
            />
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
