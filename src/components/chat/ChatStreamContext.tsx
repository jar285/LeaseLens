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
   * Sprint 18 §5 — viewer role (DB literal: `Creator` | `Editor` |
   * `Admin`). Set once from the server-rendered page and propagated
   * via the provider; never mutated client-side. Drives the tenant-
   * friendly ScanTimeline vs. the inline ToolCard stack on the chat
   * surface. Defaults to `Creator` for safety — if a consumer
   * forgets to set the prop, we default to the most-restrictive
   * (tenant) view rather than leaking developer trace by accident.
   */
  viewerRole: Role;
}

const ChatStreamContext = createContext<ChatStreamContextValue | null>(null);

export function ChatStreamProvider({
  children,
  initialEvents = [],
  viewerRole = 'Creator',
}: {
  children: ReactNode;
  initialEvents?: ToolEvent[];
  viewerRole?: Role;
}): React.JSX.Element {
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>(initialEvents);
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  const pdfViewerRef = useRef<PdfViewerHandle | null>(null);

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
    }),
    [toolEvents, pushToolEvent, activeClauseId, viewerRole],
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
