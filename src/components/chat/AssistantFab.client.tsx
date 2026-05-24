// Sprint 26c — assistant FAB (real implementation).
//
// Renders the closed pill in `bottom-6 right-6`, a quick-action menu
// that fans out above it, and a drawer that mounts the full ChatUI
// (transcript + composer). State machine lives in AssistantFabContext.
//
// Lazy-import shape: this file is the "client" implementation. The
// sibling AssistantFab.tsx wraps it in `next/dynamic({ ssr: false })`
// so the chat bundle only ships when the user actually opens the FAB.

'use client';

import { MessageCircle, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { useAssistantFab } from './AssistantFabContext';
import { useChatStream } from './ChatStreamContext';
import { ChatUI, type ChatUIProps } from './ChatUI';

export interface AssistantFabClientProps {
  workspaceName: ChatUIProps['workspaceName'];
  conversationId: ChatUIProps['conversationId'];
  initialMessages: ChatUIProps['initialMessages'];
  /**
   * Forwarded to the embedded ChatUI so streamed tool events still
   * land in ChatStreamContext (which RedFlagReport + ClausesList
   * read). When omitted the chat streams into its own local state
   * only, which is fine for the landing page where no parser
   * surfaces are mounted.
   */
  onToolEvent?: ChatUIProps['onToolEvent'];
}

interface Chip {
  id: string;
  label: string;
  prompt: string;
  /**
   * Computed enabled-state given the current ChatStreamContext.
   * Disabled chips are still rendered so the user understands what's
   * possible — only enabled when their precondition holds.
   */
  enabled: (ctx: ChipContext) => boolean;
}

interface ChipContext {
  hasActiveClause: boolean;
  hasGradings: boolean;
}

const CHIPS: Chip[] = [
  {
    id: 'explain-clause',
    label: 'Explain this clause',
    prompt:
      "Explain the highest-risk concern with the clause I'm looking at and cite the supporting NJ statute verbatim.",
    enabled: (c) => c.hasActiveClause,
  },
  {
    id: 'draft-email',
    label: 'Draft a negotiation email',
    prompt:
      'Draft a polite negotiation email to the landlord about the most concerning clause.',
    enabled: (c) => c.hasGradings,
  },
  {
    id: 'summarize-risks',
    label: 'Summarize lease risks',
    prompt: 'Summarize the red flags in this lease in plain English.',
    enabled: (c) => c.hasGradings,
  },
  {
    id: 'understand-citation',
    label: 'Help me understand a citation',
    prompt: 'How do I read an NJ statute citation like NJ Stat 46:8-19?',
    enabled: () => true,
  },
];

export function AssistantFabClient({
  workspaceName,
  conversationId,
  initialMessages,
  onToolEvent,
}: AssistantFabClientProps): React.JSX.Element {
  const fab = useAssistantFab();
  const stream = useChatStream();
  const pillRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  const chipContext: ChipContext = {
    hasActiveClause: stream.activeClauseId !== null,
    hasGradings: stream.toolEvents.some(
      (e) => e.tool_name === 'grade_clause_severity',
    ),
  };

  // Sprint 26c — restore focus to the FAB pill when the drawer closes.
  // The dialog/sheet pattern owes the user a focus return to the
  // trigger that opened it so screen-reader / keyboard navigation
  // doesn't lose its place.
  const prevStateRef = useRef(fab.state);
  useEffect(() => {
    const prev = prevStateRef.current;
    const next = fab.state;
    if (prev !== 'closed' && next === 'closed') {
      pillRef.current?.focus();
    }
    prevStateRef.current = next;
  }, [fab.state]);

  // Sprint 27 — lazy-mount the drawer on first open, then keep it
  // mounted across close→open cycles so the user's typed draft and
  // active conversation survive (Don Norman: predictable interaction;
  // Jakob Nielsen: don't make the user remember hidden behavior).
  // We hide via CSS + aria-hidden + inert so screen readers and tab
  // order ignore it while closed.
  const [hasMountedDrawer, setHasMountedDrawer] = useState(false);
  useEffect(() => {
    if (fab.state === 'drawer') {
      setHasMountedDrawer(true);
    }
  }, [fab.state]);
  const drawerOpen = fab.state === 'drawer';

  function handlePillClick(): void {
    // Sprint 27.1 — Steve Krug / Don Norman fix: a FAB shaped like a
    // chat icon should afford chat directly. The previous menu popup
    // forced the user to choose a prefilled action before the chat
    // surface appeared. Now the pill opens the drawer immediately;
    // quick-action chips have moved inside the drawer (above the
    // composer) as suggestions.
    if (fab.state === 'closed') {
      fab.openDrawer();
    } else {
      fab.close();
    }
  }

  function handleDrawerKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      fab.close();
    }
  }

  return (
    <>
      {/* Sprint 26c.10 — pill bumped from h-14/w-14 (56px) with h-6
          icon to h-16/w-16 (64px) with h-7 icon. Improves the icon-
          to-pill ratio so the affordance reads as a real primary
          action. Menu and drawer bottom-anchors shift up to keep
          the visual gap from the pill consistent. */}
      <button
        ref={pillRef}
        type="button"
        data-testid="assistant-fab"
        data-state={fab.state}
        aria-label="Open assistant"
        aria-expanded={fab.state !== 'closed'}
        onClick={handlePillClick}
        className="fixed right-6 bottom-6 z-overlay inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent-600 text-white shadow-lg transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:bg-accent-500 dark:hover:bg-accent-400"
      >
        <MessageCircle className="h-7 w-7" aria-hidden="true" />
      </button>

      {/* Sprint 27.1 — the standalone menu popup is gone. CHIPS now flow
          into the drawer as `suggestedPrompts` (rendered above the
          composer when the transcript is empty). `fab.openMenu` /
          `state === 'menu'` are still exported by AssistantFabContext
          for any future surface that wants the popup pattern, but the
          pill no longer triggers it. */}

      {hasMountedDrawer ? (
        <div
          data-testid="assistant-fab-drawer"
          data-state={fab.state}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          aria-hidden={drawerOpen ? undefined : true}
          // `inert` removes the subtree from the tab order and a11y
          // tree while the drawer is hidden. Sprint 27.1 — React 19
          // emits a console warning for the legacy `inert=""` idiom
          // ("Received an empty string for a boolean attribute"),
          // AND silently strips it from the DOM (so the drawer wasn't
          // actually inert when closed). Pass a real boolean `true`
          // instead; omit entirely when the drawer is open. We still
          // cast through `any` because the ambient JSX types lag
          // behind in some installs.
          // biome-ignore lint/suspicious/noExplicitAny: inert attr typing
          {...({ inert: drawerOpen ? undefined : true } as any)}
          tabIndex={-1}
          onKeyDown={handleDrawerKeyDown}
          // Sprint 27.1 — drawer widened so legal-paragraph answers
          // breathe. Was h-[min(640px,70vh)] w-[min(480px,calc(100vw-3rem))]
          // which read cramped against the parser column on desktop
          // (Wathan/Schoger: wider = better paragraph rhythm). Mobile
          // still collapses gracefully via the `calc(100vw-3rem)` guard.
          className={`fixed right-6 bottom-28 z-overlay flex h-[min(720px,80vh)] w-[min(560px,calc(100vw-3rem))] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-xl dark:border-neutral-800 dark:bg-neutral-900 lg:w-[min(620px,calc(100vw-3rem))] ${
            drawerOpen ? '' : 'pointer-events-none hidden'
          }`}
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 bg-surface-card px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
            <h2
              id={headingId}
              className="text-[13px] font-semibold text-fg-default"
            >
              LeaseLens assistant
            </h2>
            <button
              type="button"
              data-testid="assistant-fab-close"
              aria-label="Close assistant"
              onClick={() => fab.close()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:hover:bg-neutral-800"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ChatUI
              workspaceName={workspaceName}
              conversationId={conversationId}
              initialMessages={initialMessages}
              onToolEvent={onToolEvent}
              initialComposerText={fab.pendingPrompt ?? undefined}
              suggestedPrompts={CHIPS.map((chip) => ({
                id: chip.id,
                label: chip.label,
                prompt: chip.prompt,
                disabled: !chip.enabled(chipContext),
              }))}
              onSelectSuggestion={(prompt) =>
                fab.openWith({ initialPrompt: prompt })
              }
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
