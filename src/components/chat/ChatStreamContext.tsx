// Sprint 13 §3f — shared state for the three-pane shell.
//
// ChatUI is the single NDJSON stream reader. As it parses tool_use
// + tool_result events it pushes a normalized record into this
// context. RedFlagReport (right pane) reads them; PdfViewer (left
// pane) registers an imperative ref so the citation-chip click can
// scroll the PDF to the cited page.

'use client';

import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Role } from '@/lib/auth/types';

export interface ToolEvent {
  tool_name: string;
  input: Record<string, unknown>;
  result: unknown;
  audit_id: string | undefined;
}

export interface PdfViewerHandle {
  scrollToPage: (page: number) => void;
}

/**
 * S19.3 — minimal lease reference threaded through the context so
 * downstream consumers (useScanNarrative, ChatEmptyState) can decide
 * whether to render lease-aware affordances.
 *
 * Sprint 23c Phase 2 — `page_count` and `clause_count` added (optional)
 * so the new UploadedLeaseCard can render the "N pages · M clauses"
 * meta line. They're optional to preserve backward compatibility with
 * test fixtures that pre-date the field.
 *
 * Sprint 24.7 — `pdfUrl` moved here from a parallel `ActiveLease` shape
 * that lived in LeaseLensWorkspaceShell-local state. Reasoning: that
 * dual-state setup was the root cause of the "New conversation leaves
 * lease attached" bug — `handleNewConversation` could only see the
 * context shape, so clearing it never released the gating local state.
 * Collapsing to a single source of truth makes the reset one call.
 * The original "no bloat" rationale guarded against threading binary
 * PDF data through the context; a Blob URL string is ~50 bytes, not
 * the concern that comment was about.
 */
export interface ActiveLeaseRef {
  lease_id: string;
  filename: string;
  page_count?: number;
  clause_count?: number;
  pdfUrl?: string;
}

interface ChatStreamContextValue {
  toolEvents: ToolEvent[];
  pushToolEvent: (event: ToolEvent) => void;
  pdfViewerRef: MutableRefObject<PdfViewerHandle | null>;
  /**
   * Phase 10.8 — currently focused clause. Set when the user clicks
   * "View on page N" on a red-flag card; cleared after a short
   * timeout. The PdfViewer reads this to apply a temporary highlight
   * ring to the matching page block + sticky callout. The triggering
   * RedFlagCard reads it to apply an active-card ring on itself so
   * the connection between the two panes is visible.
   */
  activeClauseId: string | null;
  setActiveClauseId: (id: string | null) => void;
  /**
   * S19.1 — viewer role in the application domain (Tenant / Reviewer /
   * Admin). Set once from the server-rendered page and propagated via
   * the provider; never mutated client-side. Drives the tenant-
   * friendly ScanTimeline vs. the inline ToolCard stack on the chat
   * surface. Defaults to `Tenant` for safety — if a consumer forgets
   * to set the prop, we default to the most-restrictive view rather
   * than leaking developer trace by accident.
   */
  viewerRole: Role;
  /**
   * S19.3 — the lease the user has uploaded for this conversation
   * (or null when none is active). Drives the synthetic
   * "Lease uploaded" intro message and replaces the generic empty
   * state once a lease is present.
   *
   * Sprint 24.7 — also gates the dropzone-vs-PdfViewer swap in
   * LeaseLensWorkspaceShell (collapsed from a parallel local state).
   */
  activeLease: ActiveLeaseRef | null;
  setActiveLease: (lease: ActiveLeaseRef | null) => void;
  /**
   * Sprint 24.7 — full-reset action used by ChatUI.handleNewConversation
   * to clear lease + tool events + active clause in one shot. Revokes
   * the previous Blob URL (if present) before clearing so rapid
   * New → Upload → New cycles don't leak. Intended for runtime user
   * actions; persistent-lease test setups should construct a fresh
   * provider tree rather than calling reset.
   */
  resetConversation: () => void;
  /**
   * Sprint 24.7 — paired with `resetConversation` to power the
   * "Continue previous" undo affordance. ChatUI stashes the
   * pre-reset { activeLease, toolEvents } snapshot and replays it
   * here so undo is a true undo, not a chat-only undo.
   */
  restoreConversation: (snapshot: {
    activeLease: ActiveLeaseRef | null;
    toolEvents: ToolEvent[];
  }) => void;
  /**
   * Sprint 26c.11 — conversationId captured from the silent
   * AutoScanRunner's NDJSON stream. The auto-scan runs before the
   * user opens the FAB drawer, so its server-issued conversationId
   * wouldn't otherwise reach ChatUI. We surface it here; ChatUI
   * adopts it on mount when its own activeConversationId is null,
   * so subsequent manual messages continue the same thread.
   * Null when no auto-scan has run (or it ran with a conversationId
   * already supplied by SSR).
   */
  autoScanConversationId: string | null;
  setAutoScanConversationId: (id: string | null) => void;
}

const ChatStreamContext = createContext<ChatStreamContextValue | null>(null);

export function ChatStreamProvider({
  children,
  initialEvents = [],
  viewerRole = 'Tenant',
  activeLease: activeLeaseProp = null,
}: {
  children: ReactNode;
  initialEvents?: ToolEvent[];
  viewerRole?: Role;
  activeLease?: ActiveLeaseRef | null;
}): React.JSX.Element {
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>(initialEvents);
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  const [activeLease, setActiveLease] = useState<ActiveLeaseRef | null>(
    activeLeaseProp,
  );
  // Sprint 26c.11 — see context-value docstring. Set by AutoScanRunner
  // when its NDJSON stream emits a {conversationId} envelope; read by
  // ChatUI on mount to adopt the same thread.
  const [autoScanConversationId, setAutoScanConversationId] = useState<
    string | null
  >(null);
  const pdfViewerRef = useRef<PdfViewerHandle | null>(null);

  // Sync the lease state when the prop changes (e.g. a test that mounts
  // with one lease and re-renders with another, or a future server-side
  // hydration path). Calling setActiveLease(null) inside the component
  // still wins because the effect only fires on prop changes.
  useEffect(() => {
    setActiveLease(activeLeaseProp);
  }, [activeLeaseProp]);

  const pushToolEvent = useCallback((event: ToolEvent) => {
    setToolEvents((prev) => [...prev, event]);
  }, []);

  // Sprint 24.7 — full reset for ChatUI's "New conversation" button.
  //
  // Initially this also revoked the active Blob URL, but that broke the
  // "Continue previous" undo: ChatUI stashes the same `activeLease`
  // object reference (with pdfUrl) before calling reset, so revoking
  // here left the stash holding a dead URL — PdfViewer crashed with
  // "Unexpected server response (0)" when undo restored the lease.
  //
  // Revocation now lives at the *commit boundary* in ChatUI: when the
  // user sends a message in the new thread (or stashes a different
  // lease over an existing one), the stashed pdfUrl is provably
  // unreferenced and safe to revoke. See handleSubmit /
  // handleNewConversation in ChatUI.tsx.
  const resetConversation = useCallback(() => {
    setToolEvents([]);
    setActiveClauseId(null);
    setActiveLease(null);
  }, []);

  // Sprint 24.7 — paired with the undo stash in ChatUI. Replays a
  // pre-reset snapshot atomically so "Continue previous" feels like a
  // real undo (chat + lease + red-flag cards all return).
  const restoreConversation = useCallback(
    (snapshot: {
      activeLease: ActiveLeaseRef | null;
      toolEvents: ToolEvent[];
    }) => {
      setActiveLease(snapshot.activeLease);
      setToolEvents(snapshot.toolEvents);
    },
    [],
  );

  const value = useMemo(
    () => ({
      toolEvents,
      pushToolEvent,
      pdfViewerRef,
      activeClauseId,
      setActiveClauseId,
      viewerRole,
      activeLease,
      setActiveLease,
      resetConversation,
      restoreConversation,
      autoScanConversationId,
      setAutoScanConversationId,
    }),
    [
      toolEvents,
      pushToolEvent,
      activeClauseId,
      viewerRole,
      activeLease,
      resetConversation,
      restoreConversation,
      autoScanConversationId,
    ],
  );

  return (
    <ChatStreamContext.Provider value={value}>
      {children}
    </ChatStreamContext.Provider>
  );
}

export function useChatStream(): ChatStreamContextValue {
  const ctx = useContext(ChatStreamContext);
  if (!ctx) {
    throw new Error(
      'useChatStream must be called inside <ChatStreamProvider>.',
    );
  }
  return ctx;
}
