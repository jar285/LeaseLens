'use client';

import { AlertCircle, RotateCcw, SquarePen, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLeaseParser } from '@/components/lease/LeaseParserContext';
import { useScanLifecycle } from '@/components/lease/scan-lifecycle';
import { parseStreamLine } from '@/lib/chat/parse-stream-line';
import { SPRING_SNAPPY } from '@/lib/motion/presets';
import { useAssistantFab } from './AssistantFabContext';
import { markAutoScanTurn } from './auto-scan-turn';
import { ChatComposer } from './ChatComposer';
import type { ChatMessageProps, ToolInvocation } from './ChatMessage';
import { useChatStream } from './ChatStreamContext';
import { ChatTranscript } from './ChatTranscript';

// Sprint 28.8 — announcement copy for the aria-live region. Screen
// readers fire on textContent change, so we set this string into the
// announcer right after the reset. The wording is deliberate: it
// names the user's concern ("lease preserved") so the SR user knows
// the destructive-feeling action did NOT delete their workspace.
// Sprint 29.1 — copy refreshed to match the renamed button ("Clear
// assistant chat" instead of "New conversation"). The "New
// conversation" label tested as ambiguous: tenants thought it would
// reset their whole lease review. The new copy names what was
// cleared (assistant chat) and what was preserved (lease review).
const NEW_CONVERSATION_ANNOUNCEMENT =
  'Assistant chat cleared. Your lease review was preserved.';

// Sprint 29.1 — helper text wired via aria-describedby on the clear-
// chat button so screen-reader users hear what is preserved BEFORE
// they activate the destructive-sounding action (Don Norman: signal
// safety up-front, not just after the fact via the aria-live).
const CLEAR_CHAT_HELPER_TEXT =
  'Your lease, clauses, and red flags will stay here.';
const CLEAR_CHAT_HELPER_ID = 'clear-assistant-chat-helper';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to generate response';
}

export interface ChatToolEvent {
  tool_name: string;
  input: Record<string, unknown>;
  result: unknown;
  audit_id: string | undefined;
}

export interface SuggestedPrompt {
  /** Stable identity — used as React key and test selector. */
  id: string;
  /** Short label rendered on the chip. */
  label: string;
  /** The full prompt seeded into the composer when the chip is clicked. */
  prompt: string;
  /**
   * Optional. When true, the chip renders disabled (used by the FAB
   * for context-dependent suggestions like "Explain this clause"
   * before the user has selected a red flag).
   */
  disabled?: boolean;
}

export interface ChatUIProps {
  initialMessages?: ChatMessageProps[];
  conversationId?: string | null;
  workspaceName: string;
  /**
   * Sprint 13 §3f — optional callback fired once per resolved tool_result
   * event in the NDJSON stream. Used by the three-pane shell to forward
   * tool events into ChatStreamContext so the right-pane RedFlagReport
   * can render gradings progressively. When omitted, ChatUI continues to
   * stream into its own message-state only (Sprints 8-12 behavior).
   */
  onToolEvent?: (event: ChatToolEvent) => void;
  /**
   * Sprint 26c — optional seed value for the composer textarea, used
   * by the assistant FAB to pre-fill prompts like "Explain clause §3"
   * when the user clicks Explain on a red-flag card or clause row.
   * Forwarded to ChatComposer's `initialText` prop unchanged.
   */
  initialComposerText?: string;
  /**
   * Sprint 27.1 — quick-action chips rendered above the composer when
   * the transcript is empty. The FAB used to surface these as a popup
   * menu the user had to click through before reaching the chat; that
   * gate is gone. The same chips now sit inside the open drawer as
   * suggested next prompts (Steve Krug: obvious affordance; Don Norman:
   * the FAB icon should afford chat, not force a menu choice).
   */
  suggestedPrompts?: SuggestedPrompt[];
  /**
   * Sprint 27.1 — invoked when the user clicks a suggested-prompts
   * chip. The FAB wires this to `fab.openWith({ initialPrompt })` so
   * the existing prefill plumbing in ChatComposer re-seeds the
   * textarea. Standalone consumers may ignore this prop.
   */
  onSelectSuggestion?: (prompt: string) => void;
  /**
   * Sprint 29.2 — forwarded to ChatTranscript. `'hero'` (default)
   * renders the full landing-page empty state; `'compact'` renders
   * the small in-drawer header. FAB callers pass `'compact'`.
   */
  emptyStateVariant?: 'hero' | 'compact';
  /**
   * Sprint 29.4 — override for the compact-variant subhead so callers
   * (the FAB) can render job-aware copy ("No lease attached yet…",
   * "Scanning your lease…", "Ask about this lease…") that mirrors
   * the chip set. Ignored when `emptyStateVariant !== 'compact'`.
   */
  emptyStateSubhead?: string;
}

export function ChatUI({
  initialMessages = [],
  conversationId = null,
  workspaceName,
  onToolEvent,
  initialComposerText,
  suggestedPrompts,
  onSelectSuggestion,
  emptyStateVariant = 'hero',
  emptyStateSubhead,
}: ChatUIProps) {
  const [messages, setMessages] = useState<ChatMessageProps[]>(initialMessages);
  const [status, setStatus] = useState<'idle' | 'streaming' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);

  // Sprint 26c.11 — adopt the auto-scan's conversationId when ChatUI's
  // own prop is null. AutoScanRunner runs silently before the user
  // opens the FAB drawer, captures the server-issued conversationId
  // from its NDJSON stream, and broadcasts it via ChatStreamContext.
  // Without this sync, the user's manual chat would start a brand-
  // new conversation B instead of continuing conversation A.
  //
  // (Single `useChatStream()` call below pulls every field this
  // component needs — see the consolidated destructure ~30 lines down.)
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(conversationId);

  // One-click undo for "New conversation" misclicks. Stashed when the user
  // clicks New; cleared when they send a message in the new thread or click
  // Continue previous. Empty / null = no undo available.
  //
  // Sprint 24.7 — the stash now also captures the active lease and the
  // tool-event log so undo restores the full pre-reset state, not just
  // the chat thread. Previously "Continue previous" would re-attach the
  // chat but leave the dropzone in place and the right pane empty, which
  // looked like a half-finished undo.
  const [previousConversationId, setPreviousConversationId] = useState<
    string | null
  >(null);
  const [previousMessages, setPreviousMessages] = useState<ChatMessageProps[]>(
    [],
  );
  // Sprint 28.7 — chat-thread snapshots for "Continue previous" undo.
  // Parser state (activeLease, toolEvents) is intentionally NOT stashed
  // here: after the Sprint 3+4 state split, parser state lives on
  // LeaseParserContext and is never reset by a chat-thread action, so
  // there is nothing to restore on the parser side.
  const { activeLease } = useLeaseParser();
  const { autoScanConversationId } = useChatStream();
  // Sprint 33.A.2 — annotate the auto-scan's scan turn (the first
  // scan-bearing assistant message) so its redundant inline ScanTimeline
  // is suppressed; the right-pane staircase is canonical. A user-initiated
  // "scan again" is a later scan turn and keeps its timeline. Survives a
  // reload because it keys on message position, not the live-only
  // autoScanConversationId.
  const transcriptMessages = useMemo(
    () => markAutoScanTurn(messages),
    [messages],
  );
  // Sprint 28.8 — FAB context drop on "New conversation". ChatUI may
  // be mounted standalone (not inside the FAB), so we guard against a
  // missing provider by accessing via a wrapped hook; useAssistantFab
  // throws if no provider is mounted, so a try/catch in the handler
  // would be premature — every production mount goes through the
  // workspace shells where the provider exists. Tests that mount
  // ChatUI without the FAB provider stub this hook explicitly.
  const fab = useAssistantFab();

  // Sprint 28.8 — aria-live announcer text for screen readers. Set
  // by handleNewConversation; cleared by an effect after a beat so
  // repeat clicks re-announce.
  const [announcement, setAnnouncement] = useState<string>('');
  useEffect(() => {
    if (!announcement) return;
    const timer = window.setTimeout(() => setAnnouncement(''), 4000);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  // Sprint 29.5 — undo-toast visibility. Set when the user clicks
  // "Clear assistant chat"; auto-dismisses after ~6s. Independent of
  // the aria-live announcer (which runs for SR users on its own 4s
  // beat). The toast is the visual safety net for sighted users; it
  // wraps the existing previousMessages stash with an [Undo] action.
  // Sprint 29.8 — animated via motion/react (SPRING_SNAPPY, ~180ms
  // settle) so the toast slides in instead of popping. Reduced-
  // motion users skip the animation entirely and see an instant
  // appear/disappear (the aria-live announcer is the SR equivalent).
  const TOAST_VISIBLE_MS = 6000;
  const [toastVisible, setToastVisible] = useState(false);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!toastVisible) return;
    const timer = window.setTimeout(
      () => setToastVisible(false),
      TOAST_VISIBLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [toastVisible]);

  // Sprint 29.11 — "Scan complete" banner. Pairs with the Sprint 29.10
  // system-prompt scan-progress awareness section so the user has
  // matching cues at both the model + UI surfaces. When the auto-scan
  // transitions from REAL scanning → review_ready WHILE the FAB drawer
  // is open, a small persistent banner appears at the top of the
  // transcript area: "Scan complete. Ask me about the red flags."
  // It signals to a user who got a partial-state answer earlier
  // ("I see 7 of 15 graded …") that the picture is now complete —
  // a clear "ask again" affordance (Jakob Nielsen: visibility of
  // system status). Persistent until dismissed; not auto-dismissed
  // because the user may need a moment to notice it.
  //
  // Sprint 29.11.1 (Playwright regression fix) — `preparing_red_flags`
  // is EXCLUDED from "scanning" because it's a 650ms cosmetic beat
  // (Sprint 28.1 documented) that fires via an internal timer even
  // on rehydrated scan-complete state. Counting it as a transition
  // would surface the banner on a fresh page load with a seeded
  // completed scan — the user never witnessed any scanning.
  const lifecycle = useScanLifecycle();
  const [scanCompleteBannerVisible, setScanCompleteBannerVisible] =
    useState(false);
  const prevLifecycleStageRef = useRef(lifecycle.stage);
  useEffect(() => {
    const prev = prevLifecycleStageRef.current;
    const curr = lifecycle.stage;
    const REAL_SCAN_STAGES = [
      'upload_received',
      'reading_lease',
      'extracting_clauses',
      'checking_clauses',
    ] as const;
    const wasRealScanning = (REAL_SCAN_STAGES as readonly string[]).includes(
      prev,
    );
    const isComplete = curr === 'review_ready';
    if (wasRealScanning && isComplete && fab.state === 'drawer') {
      setScanCompleteBannerVisible(true);
    }
    prevLifecycleStageRef.current = curr;
  }, [lifecycle.stage, fab.state]);

  // Sprint 26c.11 — promote the auto-scan's captured conversationId
  // into local state once it's available, so the user's manual chat
  // continues the same thread instead of starting a fresh one.
  // Initial useState above seeded from `conversationId` prop only
  // (auto-scan may not have captured the id yet at first render); this
  // effect catches the late-arriving case.
  useEffect(() => {
    if (activeConversationId === null && autoScanConversationId !== null) {
      setActiveConversationId(autoScanConversationId);
    }
  }, [autoScanConversationId, activeConversationId]);

  // Sprint 25.1 (R8) — track the in-flight chat fetch so we can abort
  // on unmount / "New conversation" / rapid re-submit. Without this,
  // navigating away mid-stream leaves the reader loop running and
  // updating state on a soon-to-unmount component.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const handleNewConversation = () => {
    // Cancel any in-flight stream before clearing state so the reader
    // loop sees AbortError before it can race against the reset.
    abortRef.current?.abort();
    if (activeConversationId !== null || messages.length > 0) {
      // Sprint 28.7 — only the chat thread is stashed for the
      // "Continue previous" undo. The lease lives on
      // LeaseParserContext and was never touched, so there is nothing
      // parser-side to restore. Sprint 28.9+ may introduce an
      // explicit "Reset workspace" affordance that clears both
      // contexts on confirmation.
      setPreviousConversationId(activeConversationId);
      setPreviousMessages(messages);
    }
    setMessages([]);
    setActiveConversationId(null);
    setStatus('idle');
    setErrorMsg('');
    setQuotaRemaining(null);
    // Sprint 28.8 — drop the FAB's pendingPrompt + selection so the
    // next user question isn't biased toward the prior clause
    // context. The drawer stays open (clearPendingContext doesn't
    // touch state) — the user is mid-interaction.
    fab.clearPendingContext();
    // Sprint 28.8 — announce to screen readers that the lease is
    // preserved. The destructive-sounding label "New conversation"
    // would otherwise leave SR users wondering whether their lease
    // and red flags are still there.
    setAnnouncement(NEW_CONVERSATION_ANNOUNCEMENT);
    // Sprint 29.5 — show the visible safety-net toast. Independent
    // of the aria-live announcer (the toast is a sighted-user
    // affordance; the announcer is the SR-user affordance).
    setToastVisible(true);
  };

  const handleContinuePrevious = () => {
    setActiveConversationId(previousConversationId);
    setMessages(previousMessages);
    setPreviousConversationId(null);
    setPreviousMessages([]);
    setStatus('idle');
    setErrorMsg('');
    // Sprint 29.5 — dismiss the toast after a successful undo so the
    // restored transcript is visible without the toast hovering.
    setToastVisible(false);
  };

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || status === 'streaming') return;

    // Sending a message commits to the new thread — drop the undo-stash
    // so "Continue previous" doesn't reappear later. Sprint 28.7 — the
    // stash is now chat-only; parser state lives on LeaseParserContext
    // and is never touched by chat-thread actions, so there is no
    // pdfUrl/lease binary to revoke here.
    if (previousConversationId !== null || previousMessages.length > 0) {
      setPreviousConversationId(null);
      setPreviousMessages([]);
    }

    // Sprint 29.11 — user sending a message means they've re-engaged
    // post-scan; the "Scan complete" banner has served its purpose.
    // Hide it so it doesn't linger over the new conversation turn.
    if (scanCompleteBannerVisible) {
      setScanCompleteBannerVisible(false);
    }

    const userMessage: ChatMessageProps = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
    };

    const assistantMessageId = crypto.randomUUID();
    const initialAssistantMessage: ChatMessageProps = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      toolInvocations: [],
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
    setStatus('streaming');
    setErrorMsg('');

    // Track pending tool invocations for this response
    const pendingTools = new Map<string, ToolInvocation>();

    // Sprint 25.1 (R8) — replace any prior controller so a rapid re-submit
    // cancels the previous in-flight stream before starting the new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversationId: activeConversationId,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to generate response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentContent = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const data = parseStreamLine(line);
          if (!data) {
            continue;
          }

          if ('conversationId' in data) {
            setActiveConversationId(data.conversationId);
          } else if ('quota' in data) {
            setQuotaRemaining(data.quota.remaining);
          } else if ('error' in data) {
            throw new Error(data.error);
          } else if ('chunk' in data) {
            currentContent += data.chunk;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      content: currentContent,
                      toolInvocations: Array.from(pendingTools.values()),
                    }
                  : m,
              ),
            );
          } else if ('tool_use' in data) {
            // Add pending tool invocation
            const invocation: ToolInvocation = {
              id: data.tool_use.id,
              name: data.tool_use.name,
              input: data.tool_use.input,
            };
            pendingTools.set(data.tool_use.id, invocation);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      toolInvocations: Array.from(pendingTools.values()),
                    }
                  : m,
              ),
            );
          } else if ('tool_result' in data) {
            // Update tool invocation with result + audit metadata
            const existing = pendingTools.get(data.tool_result.id);
            if (existing) {
              existing.result = data.tool_result.result;
              existing.error = data.tool_result.error;
              existing.audit_id = data.tool_result.audit_id;
              existing.compensating_available =
                data.tool_result.compensating_available;
              pendingTools.set(data.tool_result.id, existing);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        toolInvocations: Array.from(pendingTools.values()),
                      }
                    : m,
                ),
              );

              // Sprint 13 §3f — forward the resolved tool event to the
              // three-pane shell (RedFlagReport reads it). Optional —
              // ChatUI works standalone when no callback is wired.
              onToolEvent?.({
                tool_name: data.tool_result.name ?? existing.name,
                input: existing.input,
                result: data.tool_result.result,
                audit_id: data.tool_result.audit_id,
              });
            }
          } else if ('truncated' in data) {
            // Sprint 18 — Anthropic stopped the model mid-output because
            // we hit max_tokens. Tag the message so it renders the cut-
            // off notice. The flag is set once; subsequent stream lines
            // can still arrive (Anthropic flushes whatever it already
            // generated before the stop), so we preserve any text that
            // followed and don't truncate the buffer ourselves.
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, truncated: true, truncatedReason: data.reason }
                  : m,
              ),
            );
          }
        }
      }

      if (buffer.trim()) {
        const trailingData = parseStreamLine(buffer);
        if (trailingData && 'error' in trailingData) {
          throw new Error(trailingData.error);
        }
      }

      setStatus('idle');
    } catch (error) {
      // Sprint 25.1 (R8) — silent cancel: user clicked New, unmounted, or
      // re-submitted while a stream was in flight. Drop the in-progress
      // assistant bubble; don't render an error banner. Other dispatched
      // state (status, errorMsg) is reset by whichever path triggered
      // the abort.
      if (error instanceof DOMException && error.name === 'AbortError') {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
        return;
      }
      console.error(error);
      setErrorMsg(getErrorMessage(error));
      setStatus('error');
    }
  };

  const hasMessages = messages.length > 0;
  // Sprint 24.7 — undo affordance now activates on a stashed lease too
  // (not just a stashed chat thread). Without this, a user who uploads
  // a lease, runs a scan, then misclicks "New conversation" before
  // sending any message would see no Continue-previous button — their
  // lease + red-flag cards would be unrecoverable without re-uploading.
  const hasPreviousStash =
    previousConversationId !== null || previousMessages.length > 0;
  const showContinuePrevious = !hasMessages && hasPreviousStash && !activeLease;
  const showToolbar = hasMessages || hasPreviousStash;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Sprint 28.8 — aria-live announcer for chat-thread resets so
          screen-reader users hear that the lease is preserved. Empty
          most of the time; populated for ~4s after a New conversation
          click. role="status" → polite by default, but we set the
          attribute explicitly for any AT that ignores the role default. */}
      <div
        data-testid="new-conversation-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>
      <div className="grid min-h-0 w-full flex-1 grid-rows-[auto_minmax(0,1fr)_auto]">
        {/* Conversation toolbar — visible when there's an active thread or
            a stashed previous one (one-click undo for misclicked New). */}
        <div
          data-testid="conversation-toolbar"
          // Sprint 29.1 — added `gap-2` so the new helper text sits a
          // small distance left of the Clear button (instead of butting
          // up against it). `justify-end` keeps the cluster right-anchored.
          className={`flex shrink-0 items-center justify-end gap-2 border-b border-gray-100 px-4 py-1.5 ${
            showToolbar ? '' : 'invisible'
          }`}
        >
          {showContinuePrevious ? (
            <button
              type="button"
              data-testid="continue-previous-btn"
              onClick={handleContinuePrevious}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Continue previous
            </button>
          ) : (
            <>
              {/* Sprint 29.1 — visible helper text reassures sighted
                  users that clearing the chat does NOT wipe the lease
                  review. Same element is referenced via aria-describedby
                  on the button below so screen-reader users hear it
                  before activating. Hidden on narrow viewports so the
                  toolbar stays clean on mobile; the aria description
                  still works there because aria-describedby reads
                  hidden-but-not-display:none text. */}
              <span
                id={CLEAR_CHAT_HELPER_ID}
                data-testid="clear-assistant-chat-helper"
                className="hidden text-[11px] text-gray-400 sm:inline"
              >
                {CLEAR_CHAT_HELPER_TEXT}
              </span>
              <button
                type="button"
                data-testid="new-conversation-btn"
                onClick={handleNewConversation}
                aria-describedby={CLEAR_CHAT_HELPER_ID}
                // Sprint 29.1 — renamed from "New conversation" to
                // "Clear assistant chat". The old label tested
                // ambiguous (tenants thought it would reset the whole
                // lease review). New label names exactly what is
                // cleared. testid + handler intentionally retained so
                // existing wiring + tests keep working.
                //
                // Sprint 25.2 — formerly disabled during streaming, which
                // gated the user out of R8's escape-hatch flow (clicking
                // this mid-stream is the documented way to abort an
                // in-flight reply and start fresh). handleNewConversation
                // calls abortRef.current?.abort() at the top, so the
                // in-flight fetch cancels cleanly.
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
              >
                <SquarePen className="h-3.5 w-3.5" aria-hidden="true" />
                Clear assistant chat
              </button>
            </>
          )}
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {status === 'streaming' && 'Assistant is typing...'}
          {status === 'error' && `Error: ${errorMsg}`}
        </div>

        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          {/* Sprint 29.5 — undo toast. Auto-dismisses after ~6s; an
              [Undo] click restores `previousMessages` via the existing
              continue-previous handler. The aria-live announcer
              above runs independently so SR users still hear the
              preservation message even if the toast has already
              auto-dismissed by the time they parse it.
              Sprint 29.8 — wrapped in AnimatePresence + motion.div so
              the toast slides in/out via SPRING_SNAPPY instead of
              popping. Reduced-motion users get the plain branch
              (instant appear/disappear, no transform). */}
          <AnimatePresence initial={false}>
            {toastVisible &&
              (reducedMotion ? (
                <div
                  key="toast"
                  data-testid="assistant-undo-toast"
                  data-motion="off"
                  role="status"
                  className="absolute inset-x-3 top-3 z-overlay flex items-start gap-3 rounded-md border border-neutral-200 bg-surface-card px-3 py-2 text-[12px] shadow-lift dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <p className="flex-1 leading-snug text-fg-default">
                    Assistant chat cleared. Your lease review was preserved.
                  </p>
                  <button
                    type="button"
                    data-testid="assistant-undo-toast-button"
                    onClick={handleContinuePrevious}
                    className="shrink-0 rounded-md border border-accent-200 bg-surface-card px-2 py-1 text-[12px] font-medium text-accent-700 transition-colors hover:bg-accent-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-accent-500/40 dark:bg-neutral-900 dark:text-accent-300 dark:hover:bg-accent-500/10"
                  >
                    Undo
                  </button>
                </div>
              ) : (
                <motion.div
                  key="toast"
                  data-testid="assistant-undo-toast"
                  data-motion="on"
                  role="status"
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={SPRING_SNAPPY}
                  className="absolute inset-x-3 top-3 z-overlay flex items-start gap-3 rounded-md border border-neutral-200 bg-surface-card px-3 py-2 text-[12px] shadow-lift dark:border-neutral-700 dark:bg-neutral-900"
                >
                  <p className="flex-1 leading-snug text-fg-default">
                    Assistant chat cleared. Your lease review was preserved.
                  </p>
                  <button
                    type="button"
                    data-testid="assistant-undo-toast-button"
                    onClick={handleContinuePrevious}
                    className="shrink-0 rounded-md border border-accent-200 bg-surface-card px-2 py-1 text-[12px] font-medium text-accent-700 transition-colors hover:bg-accent-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-accent-500/40 dark:bg-neutral-900 dark:text-accent-300 dark:hover:bg-accent-500/10"
                  >
                    Undo
                  </button>
                </motion.div>
              ))}
          </AnimatePresence>
          {/* Sprint 29.11 — "Scan complete" banner. Persistent (not
              auto-dismiss) so a user who got the partial-state
              answer from Sprint 29.10's system prompt can clearly
              see "things changed — ask again now." Sits BELOW the
              undo toast (top-12 vs top-3) so the two can coexist
              if the user clears the chat right after a scan
              completes — extremely rare but possible. */}
          {scanCompleteBannerVisible ? (
            <div
              data-testid="assistant-scan-complete-banner"
              role="status"
              aria-live="polite"
              className="absolute inset-x-3 top-3 z-overlay flex items-start gap-3 rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-[12px] shadow-lift dark:border-accent-500/40 dark:bg-accent-500/10"
            >
              <p className="flex-1 leading-snug text-accent-700 dark:text-accent-200">
                Scan complete. Ask me about the red flags.
              </p>
              <button
                type="button"
                data-testid="assistant-scan-complete-banner-dismiss"
                aria-label="Dismiss scan-complete banner"
                onClick={() => setScanCompleteBannerVisible(false)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-accent-700 transition-colors hover:bg-accent-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:text-accent-200 dark:hover:bg-accent-500/20"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          <ChatTranscript
            messages={transcriptMessages}
            isStreaming={status === 'streaming'}
            onSelectPrompt={handleSubmit}
            workspaceName={workspaceName}
            emptyStateVariant={emptyStateVariant}
            emptyStateSubhead={emptyStateSubhead}
          />
        </div>

        <div className="flex flex-col">
          {quotaRemaining !== null && quotaRemaining <= 2 && (
            <div className="mx-6 mb-1 mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Demo quota: {quotaRemaining} message
              {quotaRemaining !== 1 ? 's' : ''} remaining this hour.
            </div>
          )}

          {status === 'error' && (
            <div className="mx-6 mb-2 mt-2 flex shrink-0 items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3.5 text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold">
                  Failed to generate response
                </h3>
                <p className="mt-0.5 text-sm text-red-600/80">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Sprint 27.1 — suggested-prompts row.
              Visible only when the transcript is empty (no committed
              messages yet) AND the caller supplied at least one chip.
              Clicking a chip fires `onSelectSuggestion(prompt)` which
              the FAB routes through `fab.openWith` so ChatComposer's
              existing prefill effect re-seeds the textarea. Hidden
              once the user starts a thread so the chips don't compete
              with the composer once chat has begun. */}
          {!hasMessages &&
          suggestedPrompts &&
          suggestedPrompts.length > 0 &&
          onSelectSuggestion ? (
            <div
              data-testid="chat-suggested-prompts"
              className="flex shrink-0 flex-wrap gap-1.5 border-t border-neutral-100 px-6 pb-2 pt-3 dark:border-neutral-800"
            >
              {suggestedPrompts.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  data-testid="chat-suggested-prompt"
                  data-suggestion-id={s.id}
                  disabled={s.disabled}
                  onClick={() => onSelectSuggestion(s.prompt)}
                  className="inline-flex items-center rounded-full border border-accent-200 bg-surface-card px-3 py-1.5 text-xs font-medium text-accent-700 transition-colors hover:border-accent-300 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-transparent disabled:text-fg-subtle disabled:hover:bg-transparent dark:border-accent-500/30 dark:bg-neutral-900 dark:text-accent-300 dark:hover:border-accent-400/50 dark:hover:bg-accent-500/10"
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}

          <ChatComposer
            onSubmit={handleSubmit}
            isLocked={status === 'streaming'}
            initialText={initialComposerText}
          />
        </div>
      </div>
    </div>
  );
}
