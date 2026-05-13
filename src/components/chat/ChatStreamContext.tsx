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
 * whether to render lease-aware affordances. The full lease object
 * (with pdfUrl etc.) stays local to LeaseLensWorkspaceShell; only the
 * narrative-relevant fields surface here to avoid bloating the context.
 */
export interface ActiveLeaseRef {
  lease_id: string;
  filename: string;
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
   */
  activeLease: ActiveLeaseRef | null;
  setActiveLease: (lease: ActiveLeaseRef | null) => void;
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
    }),
    [toolEvents, pushToolEvent, activeClauseId, viewerRole, activeLease],
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
