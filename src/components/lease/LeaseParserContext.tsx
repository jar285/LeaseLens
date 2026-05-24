// Sprint 28.2 — parser state ownership.
//
// LeaseParserContext owns the parser-shaped slice of the workspace:
// the uploaded lease, the stream of parser tool events, the
// currently-highlighted clause, and the imperative PdfViewer ref.
// Previously this slice co-habited with ChatStreamContext, which
// meant resetting the chat thread also nuked the lease + extracted
// clauses + red flags — the user-visible Bug 3. Splitting the slice
// makes the boundary explicit (Uncle Bob: separation of concerns)
// and the reset surgically scoped (Don Norman: actions should match
// their labels).
//
// Sprint 2 of the bug-triage plan lands this context in isolation
// — no consumer migrates and ChatStreamContext is untouched. The
// migration happens in Sprint 3; the removal of parser state from
// ChatStreamContext happens in Sprint 4.

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
import type {
  ActiveLeaseRef,
  PdfViewerHandle,
  ToolEvent,
} from '@/components/chat/ChatStreamContext';

export interface LeaseParserSnapshot {
  activeLease: ActiveLeaseRef | null;
  toolEvents: ToolEvent[];
}

interface LeaseParserContextValue {
  activeLease: ActiveLeaseRef | null;
  toolEvents: ToolEvent[];
  activeClauseId: string | null;
  pdfViewerRef: MutableRefObject<PdfViewerHandle | null>;
  setActiveLease: (lease: ActiveLeaseRef | null) => void;
  appendToolEvent: (event: ToolEvent) => void;
  setActiveClauseId: (id: string | null) => void;
  /**
   * Parser-only reset. Clears `activeLease`, `toolEvents`, and
   * `activeClauseId`. Does NOT touch any chat-thread state. The
   * Blob URL revocation policy lives at the commit boundary in
   * ChatUI (per ChatStreamContext's prior contract); this method
   * intentionally does not revoke the URL so undo-from-snapshot
   * remains a true undo.
   */
  resetParser: () => void;
  /**
   * Paired with `resetParser` to power undo from a pre-reset snapshot.
   * Atomically restores both `activeLease` and `toolEvents`.
   */
  restoreParserSnapshot: (snapshot: LeaseParserSnapshot) => void;
}

const LeaseParserContext = createContext<LeaseParserContextValue | null>(null);

export function LeaseParserProvider({
  children,
  initialEvents = [],
  activeLease: activeLeaseProp = null,
}: {
  children: ReactNode;
  initialEvents?: ToolEvent[];
  activeLease?: ActiveLeaseRef | null;
}): React.JSX.Element {
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>(initialEvents);
  const [activeClauseId, setActiveClauseId] = useState<string | null>(null);
  const [activeLease, setActiveLease] = useState<ActiveLeaseRef | null>(
    activeLeaseProp,
  );
  const pdfViewerRef = useRef<PdfViewerHandle | null>(null);

  // Sync the lease state when the prop changes (e.g. a server hydration
  // path that re-renders with a different lease). Calling setActiveLease
  // imperatively inside the tree still wins for the next render because
  // the effect only fires on prop change.
  useEffect(() => {
    setActiveLease(activeLeaseProp);
  }, [activeLeaseProp]);

  const appendToolEvent = useCallback((event: ToolEvent) => {
    setToolEvents((prev) => [...prev, event]);
  }, []);

  const resetParser = useCallback(() => {
    setToolEvents([]);
    setActiveClauseId(null);
    setActiveLease(null);
  }, []);

  const restoreParserSnapshot = useCallback((snapshot: LeaseParserSnapshot) => {
    setActiveLease(snapshot.activeLease);
    setToolEvents(snapshot.toolEvents);
  }, []);

  const value = useMemo(
    () => ({
      activeLease,
      toolEvents,
      activeClauseId,
      pdfViewerRef,
      setActiveLease,
      appendToolEvent,
      setActiveClauseId,
      resetParser,
      restoreParserSnapshot,
    }),
    [
      activeLease,
      toolEvents,
      activeClauseId,
      appendToolEvent,
      resetParser,
      restoreParserSnapshot,
    ],
  );

  return (
    <LeaseParserContext.Provider value={value}>
      {children}
    </LeaseParserContext.Provider>
  );
}

export function useLeaseParser(): LeaseParserContextValue {
  const ctx = useContext(LeaseParserContext);
  if (!ctx) {
    throw new Error(
      'useLeaseParser must be called inside <LeaseParserProvider>.',
    );
  }
  return ctx;
}
