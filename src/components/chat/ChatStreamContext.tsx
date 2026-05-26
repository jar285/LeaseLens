// Sprint 13 §3f — shared state for the three-pane shell.
//
// Sprint 28.7 — chat-only after the state split. Parser-shape state
// (uploaded lease, tool events, active clause, PdfViewer ref) now
// lives exclusively on LeaseParserContext. This context retains the
// chat-thread concerns: the viewer's role (so ChatMessage / ToolCard
// can branch tenant vs. reviewer rendering) and the auto-scan's
// captured conversationId (so the FAB's manual chat picks up the
// same thread instead of forking).
//
// `ToolEvent`, `ActiveLeaseRef`, and `PdfViewerHandle` types are kept
// exported from this file as the shared type surface — LeaseParserContext
// and other consumers re-use them so the migration didn't require
// duplicating type definitions.

'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
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
 * S19.3 — minimal lease reference threaded through the parser context
 * so downstream consumers (useScanNarrative, ChatEmptyState) can decide
 * whether to render lease-aware affordances.
 *
 * Sprint 23c Phase 2 — `page_count` and `clause_count` added (optional)
 * so UploadedLeaseCard can render the "N pages · M clauses" meta line.
 *
 * Sprint 24.7 — `pdfUrl` lives here. Type is still exported from this
 * file as the canonical shape; LeaseParserContext imports it.
 */
export interface ActiveLeaseRef {
  lease_id: string;
  filename: string;
  page_count?: number;
  clause_count?: number;
  pdfUrl?: string;
}

interface ChatStreamContextValue {
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
  viewerRole = 'Tenant',
}: {
  children: ReactNode;
  viewerRole?: Role;
}): React.JSX.Element {
  const [autoScanConversationId, setAutoScanConversationId] = useState<
    string | null
  >(null);

  const value = useMemo(
    () => ({
      viewerRole,
      autoScanConversationId,
      setAutoScanConversationId,
    }),
    [viewerRole, autoScanConversationId],
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
