// Sprint 26c — FAB state machine + selection context.
//
// Owns three pieces of state for the floating assistant:
//   - the FAB's open/closed state (closed → menu → drawer)
//   - the prompt to seed the composer with on next drawer open
//   - the clause selection (clauseId + severity + statute) that the
//     caller wants the FAB to operate on
//
// The chat surface itself still lives on ChatStreamContext. This
// context is purely about the FAB UI: what's visible, what to prefill,
// which clause the user just clicked Explain on.

'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { Severity } from '@/components/lease/grading';

export type AssistantFabState = 'closed' | 'menu' | 'drawer';

export interface AssistantFabSelection {
  /** clause_id the FAB will operate on, or null when no clause is selected. */
  clauseId: string | null;
  /** severity of the selected clause, when known. */
  severity?: Severity;
  /** statute citation associated with the selected clause, when known. */
  statuteCitation?: string;
}

export interface OpenWithOptions {
  /** Text the FAB drawer should pre-fill into the composer on mount. */
  initialPrompt: string;
  clauseId?: string | null;
  severity?: Severity;
  statuteCitation?: string;
}

export interface AssistantFabContextValue {
  state: AssistantFabState;
  /** Prompt text the drawer should seed the composer with on next open. */
  pendingPrompt: string | null;
  selection: AssistantFabSelection;
  /** Transition: closed → menu. No-op when already open. */
  openMenu: () => void;
  /** Transition: → drawer with no prefill. */
  openDrawer: () => void;
  /**
   * Transition: → drawer with a prefilled prompt + optional clause
   * selection. Used by RedFlagReport's Explain / Draft email buttons
   * and by ClausesList's Explain icon button.
   */
  openWith: (opts: OpenWithOptions) => void;
  /**
   * Transition: any → closed. Sprint 27 — close() now PRESERVES
   * pendingPrompt and selection so the user's draft and clause
   * context survive a close→open cycle (Don Norman: predictable
   * interaction). Callers that need a hard reset (e.g. the chat's
   * "New conversation" button) should call clearContext() instead.
   */
  close: () => void;
  /**
   * Hard reset: closes the drawer AND drops pendingPrompt + selection.
   * Use when the user genuinely wants to start fresh.
   */
  clearContext: () => void;
  /**
   * Sprint 28.8 — focused variant for ChatUI's "New conversation"
   * handler. Drops pendingPrompt + selection (so the FAB no longer
   * carries the old clause context into the new chat thread) but
   * leaves drawer state alone — the user is mid-interaction and
   * expects to keep typing their next question immediately, not
   * re-open the drawer.
   */
  clearPendingContext: () => void;
  /**
   * Sprint 29.3 — narrower than clearPendingContext. Drops ONLY the
   * clause selection (clauseId + severity + statuteCitation);
   * preserves pendingPrompt + drawer state. Used by the in-drawer
   * context bar's "Detach clause" ✕ button so the user can drop a
   * specific clause focus without losing their typed prefill or
   * being kicked out of the drawer.
   */
  detachSelection: () => void;
}

const AssistantFabContext = createContext<AssistantFabContextValue | null>(
  null,
);

const EMPTY_SELECTION: AssistantFabSelection = {
  clauseId: null,
  severity: undefined,
  statuteCitation: undefined,
};

export function AssistantFabProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const [state, setState] = useState<AssistantFabState>('closed');
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [selection, setSelection] =
    useState<AssistantFabSelection>(EMPTY_SELECTION);

  const openMenu = useCallback(() => {
    setState('menu');
  }, []);

  const openDrawer = useCallback(() => {
    setState('drawer');
  }, []);

  const openWith = useCallback((opts: OpenWithOptions) => {
    setPendingPrompt(opts.initialPrompt);
    setSelection({
      clauseId: opts.clauseId ?? null,
      severity: opts.severity,
      statuteCitation: opts.statuteCitation,
    });
    setState('drawer');
  }, []);

  const close = useCallback(() => {
    setState('closed');
  }, []);

  const clearContext = useCallback(() => {
    setState('closed');
    setPendingPrompt(null);
    setSelection(EMPTY_SELECTION);
  }, []);

  const clearPendingContext = useCallback(() => {
    setPendingPrompt(null);
    setSelection(EMPTY_SELECTION);
  }, []);

  const detachSelection = useCallback(() => {
    // Sprint 29.3 — narrower than clearPendingContext: only the
    // clause selection clears. pendingPrompt + drawer state survive
    // so the user can drop a clause focus without losing their
    // typed prefill or having the drawer reset around them.
    setSelection(EMPTY_SELECTION);
  }, []);

  const value = useMemo<AssistantFabContextValue>(
    () => ({
      state,
      pendingPrompt,
      selection,
      openMenu,
      openDrawer,
      openWith,
      close,
      clearContext,
      clearPendingContext,
      detachSelection,
    }),
    [
      state,
      pendingPrompt,
      selection,
      openMenu,
      openDrawer,
      openWith,
      close,
      clearContext,
      clearPendingContext,
      detachSelection,
    ],
  );

  return (
    <AssistantFabContext.Provider value={value}>
      {children}
    </AssistantFabContext.Provider>
  );
}

export function useAssistantFab(): AssistantFabContextValue {
  const value = useContext(AssistantFabContext);
  if (!value) {
    throw new Error(
      'useAssistantFab must be called within an AssistantFabProvider',
    );
  }
  return value;
}
