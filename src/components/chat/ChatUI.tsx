'use client';

import { AlertCircle, Ellipsis, RotateCcw, SquarePen, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLeaseParser } from '@/components/lease/LeaseParserContext';
import { useScanLifecycle } from '@/components/lease/scan-lifecycle';
import { parseStreamLine } from '@/lib/chat/parse-stream-line';
import { EASE_OUT_SOFT, SPRING_SNAPPY } from '@/lib/motion/presets';
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

// Sprint 37.5 — subtle staggered reveal for the suggestion chips when the
// help popover opens (mirrors the ChatEmptyState pattern: 60ms stagger, soft
// ease, small rise). Calm + premium, never bouncy (Dieter Rams). Gated on
// reduced-motion at the call site so motion-averse users get the chips
// instantly.
const CHIP_STAGGER_CONTAINER = {
  visible: { transition: { staggerChildren: 0.06 } },
};
const CHIP_STAGGER_ITEM = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.25, ease: EASE_OUT_SOFT },
  },
};

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
  /**
   * Sprint 37.1 — state-aware composer placeholder. Forwarded to
   * ChatComposer. The FAB passes a general-help string before a lease
   * is attached and leaves it undefined (lease-context default) after.
   */
  composerPlaceholder?: string;
  /**
   * Sprint 37.3 — fired whenever the committed-message count crosses
   * empty↔non-empty. The FAB uses it to derive its `landing-chat`
   * display mode (no lease + the user has asked a question → grow the
   * popover slightly). Message state stays owned here; only a boolean
   * leaves the component (no parser/chat-context coupling).
   */
  onHasMessagesChange?: (hasMessages: boolean) => void;
  /**
   * Sprint 37.3 — forwarded to ChatTranscript → ChatMessage so a long
   * answer can offer "Read in full view". The FAB wires this to expand
   * the drawer, and passes it only when not already expanded.
   */
  onRequestExpandedReading?: () => void;
  /**
   * Sprint 52.5 — when set, the chat-thread overflow (⋯) trigger + menu are
   * portaled into this DOM node (the FAB drawer's masthead control cluster)
   * instead of floating over the transcript. Fixes the workspace-drawer overlap
   * where the floating ⋯ collided with full-width message text (the
   * `expanded-reading` gutter was accidentally hiding it). Omitted by non-FAB /
   * legacy mounts, which keep the in-place render.
   */
  threadMenuContainer?: HTMLElement | null;
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
  composerPlaceholder,
  onHasMessagesChange,
  onRequestExpandedReading,
  threadMenuContainer,
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

  // Sprint 52.2 — chat-thread overflow menu. The persistent "Clear assistant
  // chat" strip is gone; its controls now live in a disclosure popover behind a
  // slim floating ⋯ trigger, so the reading surface stays uncluttered (Steve
  // Krug; Dieter Rams). Outside-pointerdown + Escape close it and return focus
  // to the trigger (Apple HIG / Material menu behaviour). The popover keeps the
  // SAME testids + handlers as before, so the thread-clear/continue wiring and
  // its aria-live "lease preserved" reassurance are unchanged.
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const threadMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const threadMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!threadMenuOpen) return;
    // Move focus into the menu on open so keyboard users land on the first
    // action (Apple HIG / Material menu behaviour).
    threadMenuRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (
        threadMenuRef.current?.contains(target) ||
        threadMenuTriggerRef.current?.contains(target)
      ) {
        return;
      }
      setThreadMenuOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [threadMenuOpen]);
  const closeThreadMenu = (returnFocus = false) => {
    setThreadMenuOpen(false);
    if (returnFocus) threadMenuTriggerRef.current?.focus();
  };

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
  // Sprint 37.3 — report empty↔non-empty transitions up to the FAB so it can
  // derive `landing-chat` (no lease + the user has asked something → grow the
  // popover). Only a boolean crosses the boundary; messages stay owned here.
  useEffect(() => {
    onHasMessagesChange?.(hasMessages);
  }, [hasMessages, onHasMessagesChange]);
  // Sprint 24.7 — undo affordance now activates on a stashed lease too
  // (not just a stashed chat thread). Without this, a user who uploads
  // a lease, runs a scan, then misclicks "New conversation" before
  // sending any message would see no Continue-previous button — their
  // lease + red-flag cards would be unrecoverable without re-uploading.
  const hasPreviousStash =
    previousConversationId !== null || previousMessages.length > 0;
  const showContinuePrevious = !hasMessages && hasPreviousStash && !activeLease;
  const showToolbar = hasMessages || hasPreviousStash;
  // Sprint 36.6 — suggestion chips render as conversation-starters only
  // while the transcript is empty. When they show, they share one footer
  // enclosure with the composer (single divider above the eyebrow), so
  // the composer is told to drop its own divider (`grouped`).
  const showSuggestions =
    !hasMessages &&
    !!suggestedPrompts &&
    suggestedPrompts.length > 0 &&
    !!onSelectSuggestion;

  // Sprint 52.5 — the chat-thread overflow (⋯) trigger + menu. Rendered once,
  // either portaled into the FAB masthead's control cluster (`threadMenuContainer`,
  // next to Expand/Close) or, for non-FAB / legacy mounts, in place inside the
  // `conversation-toolbar` grid anchor below. The trigger is a normal flex
  // child (NOT an absolute overlay) so it never floats over the transcript; the
  // popover drops below it (`top-full`). The `relative` wrapper anchors the
  // popover in both mount locations.
  const threadMenuInner = (
    <div className="relative flex items-center">
      <button
        ref={threadMenuTriggerRef}
        type="button"
        data-testid="assistant-thread-menu-trigger"
        aria-haspopup="true"
        aria-expanded={threadMenuOpen}
        aria-label="Conversation options"
        onClick={() => setThreadMenuOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && threadMenuOpen) {
            e.preventDefault();
            closeThreadMenu(true);
          }
        }}
        // 44px hit area (house WCAG baseline), quiet until hovered/focused so it
        // reads as a calm window control beside Expand/Close, not a competing one.
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 motion-reduce:transition-none dark:hover:bg-neutral-800"
      >
        <Ellipsis className="h-4 w-4" aria-hidden="true" />
      </button>
      <div
        ref={threadMenuRef}
        data-testid="assistant-thread-menu"
        role="menu"
        aria-label="Conversation options"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            closeThreadMenu(true);
          }
        }}
        className={`absolute right-0 top-full z-overlay mt-1 flex w-60 max-w-[calc(100vw-2rem)] flex-col gap-0.5 rounded-xl border border-border-hairline bg-surface-card p-1.5 shadow-popover dark:bg-neutral-900 ${
          threadMenuOpen ? '' : 'hidden'
        }`}
      >
        {showContinuePrevious ? (
          <button
            type="button"
            role="menuitem"
            data-testid="continue-previous-btn"
            onClick={() => {
              handleContinuePrevious();
              closeThreadMenu(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium text-fg-default transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 dark:hover:bg-neutral-800"
          >
            <RotateCcw
              className="h-4 w-4 shrink-0 text-fg-muted"
              aria-hidden="true"
            />
            Continue previous
          </button>
        ) : (
          <>
            <button
              type="button"
              role="menuitem"
              data-testid="new-conversation-btn"
              onClick={() => {
                // Sprint 25.2 — clicking mid-stream is the documented escape
                // hatch; handleNewConversation aborts the in-flight fetch at the
                // top, so this stays enabled while streaming.
                handleNewConversation();
                closeThreadMenu(true);
              }}
              aria-describedby={CLEAR_CHAT_HELPER_ID}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium text-fg-default transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 dark:hover:bg-neutral-800"
            >
              <SquarePen
                className="h-4 w-4 shrink-0 text-fg-muted"
                aria-hidden="true"
              />
              Clear assistant chat
            </button>
            {/* Sprint 52.2 — the "your lease will stay here" reassurance is
                VISIBLE in the menu on every viewport (was hidden < sm) and still
                wired via aria-describedby so SR users hear it before activating
                the destructive-sounding action (Don Norman: signal safety up
                front). */}
            <span
              id={CLEAR_CHAT_HELPER_ID}
              data-testid="clear-assistant-chat-helper"
              className="px-3 pb-1 pt-0.5 text-[11px] leading-snug text-fg-muted"
            >
              {CLEAR_CHAT_HELPER_TEXT}
            </span>
          </>
        )}
      </div>
    </div>
  );

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
        {/* Sprint 52.2 — chat-thread controls live behind a slim floating
            overflow (⋯) trigger instead of a persistent toolbar strip. The
            anchor is a 0-height `relative` box, so the old ~32px row's flow
            height is reclaimed for the answer; the trigger + popover float over
            the transcript's top-right (Steve Krug: declutter; Dieter Rams: less
            but better; Wathan/Schoger: hierarchy via space, not a fenced band).
            The whole anchor is `hidden` when there's no thread/stash, preserving
            the Sprint 38.6 "no dead void in the empty popover" contract.
            testids + handlers + the aria-live preservation announcer are
            unchanged — only the chrome moved. */}
        {/* Sprint 52.5 — `conversation-toolbar` stays as the grid's row-1
            anchor (preserves the 3-row template + the "hidden when no thread"
            contract), but it now only HOSTS the menu when there's no FAB header
            slot. When the FAB provides `threadMenuContainer`, the trigger + menu
            are portaled into the masthead beside Expand/Close, so they never
            float over (and overlap) the transcript. */}
        <div
          data-testid="conversation-toolbar"
          className={`relative flex justify-end ${showToolbar ? '' : 'hidden'}`}
        >
          {threadMenuContainer ? null : threadMenuInner}
        </div>
        {threadMenuContainer
          ? createPortal(threadMenuInner, threadMenuContainer)
          : null}

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
            onRequestExpand={onRequestExpandedReading}
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

          {/* Sprint 27.1 — suggested-prompts, rendered only while the
              transcript is empty (no committed messages) AND the caller
              supplied at least one chip. Clicking a chip fires
              `onSelectSuggestion(prompt)` which the FAB routes through
              `fab.openWith` so ChatComposer's prefill effect re-seeds
              the textarea. Hidden once a thread begins so the chips
              don't compete with the composer.
              Sprint 36.6 — unified footer card: a single `border-t`
              lives here (above the "Try asking" eyebrow), and the
              composer below is `grouped` (drops its own divider), so
              chips + input read as one calm footer block instead of two
              separately-fenced bands. The eyebrow uses the same mono-ish
              eyebrow register as the context bar's "Using:" label, and
              the chips get a comfier ~36px tap target (py-2.5). */}
          {showSuggestions ? (
            <div
              data-testid="chat-suggested-prompts"
              // Sprint 38.6 — tightened the TRY ASKING card a touch (eyebrow↔chips
              // gap-2→gap-1.5, pt-3→pt-2.5) so the section reads more compact and
              // its top edge sits a little lower toward the composer.
              className="flex shrink-0 flex-col gap-1.5 border-t border-neutral-100 bg-surface-card px-6 pb-2 pt-2.5 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <span
                data-testid="chat-suggested-prompts-eyebrow"
                className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle"
              >
                Try asking
              </span>
              {/* Sprint 37.5 — chips reveal with a subtle 60ms stagger when
                  the popover opens. Reduced-motion users get them instantly
                  (`initial={false}` + no per-item variants); `data-motion`
                  records which path ran for tests. */}
              <motion.div
                data-motion={reducedMotion ? 'off' : 'on'}
                className="flex flex-wrap gap-1.5"
                variants={CHIP_STAGGER_CONTAINER}
                initial={reducedMotion ? false : 'hidden'}
                animate={reducedMotion ? false : 'visible'}
              >
                {suggestedPrompts?.map((s) => (
                  <motion.button
                    key={s.id}
                    type="button"
                    data-testid="chat-suggested-prompt"
                    data-suggestion-id={s.id}
                    disabled={s.disabled}
                    onClick={() => onSelectSuggestion?.(s.prompt)}
                    variants={reducedMotion ? undefined : CHIP_STAGGER_ITEM}
                    // Sprint 38.2 — soft-fill pill (warm accent wash) with a
                    // subtle hover lift (enabled + motion-safe only), not a bare
                    // outline. Disabled chips ghost to transparent.
                    className="inline-flex items-center rounded-full border border-accent-200/70 bg-accent-50/70 px-3.5 py-1.5 text-xs font-medium text-accent-700 transition-[color,background-color,border-color,translate] duration-150 ease-out hover:border-accent-300 enabled:hover:bg-accent-100 motion-safe:enabled:hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:bg-transparent disabled:text-fg-subtle dark:border-accent-500/30 dark:bg-accent-500/10 dark:text-accent-300 dark:hover:border-accent-400/50 dark:enabled:hover:bg-accent-500/15"
                  >
                    {s.label}
                  </motion.button>
                ))}
              </motion.div>
            </div>
          ) : null}

          <ChatComposer
            onSubmit={handleSubmit}
            isLocked={status === 'streaming'}
            initialText={initialComposerText}
            grouped={showSuggestions}
            placeholder={composerPlaceholder}
          />
        </div>
      </div>
    </div>
  );
}
