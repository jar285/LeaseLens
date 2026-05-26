'use client';

import { AlertCircle, RotateCcw, SquarePen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLeaseParser } from '@/components/lease/LeaseParserContext';
import { parseStreamLine } from '@/lib/chat/parse-stream-line';
import { getPdfBinaryRepository } from '@/lib/lease/pdf-binary-repository';
import { ChatComposer } from './ChatComposer';
import type { ChatMessageProps, ToolInvocation } from './ChatMessage';
import {
  type ActiveLeaseRef,
  type ToolEvent,
  useChatStream,
} from './ChatStreamContext';
import { ChatTranscript } from './ChatTranscript';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to generate response';
}

// Sprint 25 — best-effort cache eviction at the commit boundary. Pairs
// with the existing `URL.revokeObjectURL` call so the cached PDF bytes
// don't outlive the Blob URL the app could use to render them. Fire-
// and-forget; failures are non-actionable for the user.
function evictCachedPdf(leaseId: string): void {
  void getPdfBinaryRepository()
    .delete(leaseId)
    .catch(() => {});
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
}

export function ChatUI({
  initialMessages = [],
  conversationId = null,
  workspaceName,
  onToolEvent,
  initialComposerText,
  suggestedPrompts,
  onSelectSuggestion,
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
  const [previousActiveLease, setPreviousActiveLease] =
    useState<ActiveLeaseRef | null>(null);
  const [previousToolEvents, setPreviousToolEvents] = useState<ToolEvent[]>([]);

  // Sprint 28.6 — parser state (activeLease, toolEvents) lives on
  // LeaseParserContext now. Chat-thread state (resetConversation,
  // restoreConversation, autoScanConversationId) stays on
  // ChatStreamContext. The two reset functions intentionally only
  // touch their own slice — that's the Bug 3 fix in action: clicking
  // "New conversation" no longer drops the lease or the red flags.
  const { activeLease, toolEvents } = useLeaseParser();
  const { resetConversation, restoreConversation, autoScanConversationId } =
    useChatStream();

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
    if (activeConversationId !== null || messages.length > 0 || activeLease) {
      // Sprint 24.7 — if the stash is being overwritten by a different
      // lease, revoke the soon-to-be-orphaned pdfUrl. The OLD stashed
      // lease is about to become unreachable in app state; without this
      // revoke, its Blob URL would leak until page unload. Skip the
      // revoke when the URLs match (defensive — shouldn't happen since
      // each upload produces a unique blob, but harmless to guard).
      if (
        previousActiveLease?.pdfUrl &&
        previousActiveLease.pdfUrl !== activeLease?.pdfUrl
      ) {
        try {
          URL.revokeObjectURL(previousActiveLease.pdfUrl);
        } catch {
          // revokeObjectURL is best-effort and a no-op in jsdom tests.
        }
        // Sprint 25 — also evict the IndexedDB-cached bytes for the
        // about-to-be-orphaned lease. Mirrors the Blob URL revoke: the
        // OLD stash is being overwritten, so the bytes are no longer
        // reachable from app state.
        evictCachedPdf(previousActiveLease.lease_id);
      }
      setPreviousConversationId(activeConversationId);
      setPreviousMessages(messages);
      // Sprint 24.7 — snapshot the lease + tool events alongside the
      // chat thread so "Continue previous" can put everything back.
      setPreviousActiveLease(activeLease);
      setPreviousToolEvents(toolEvents);
    }
    setMessages([]);
    setActiveConversationId(null);
    setStatus('idle');
    setErrorMsg('');
    setQuotaRemaining(null);
    // Sprint 24.7 — clears toolEvents, activeClauseId, and activeLease
    // on the context. This is what brings the dropzone back and empties
    // the red-flag pane. The Blob URL is NOT revoked here — the stash
    // still holds a reference to the same activeLease object, and
    // revoking too early breaks "Continue previous." Revocation moves
    // to the commit boundary (above and in handleSubmit).
    resetConversation();
  };

  const handleContinuePrevious = () => {
    setActiveConversationId(previousConversationId);
    setMessages(previousMessages);
    // Sprint 24.7 — restore lease + tool events atomically so the undo
    // is a real undo (dropzone → viewer, red-flag cards return).
    restoreConversation({
      activeLease: previousActiveLease,
      toolEvents: previousToolEvents,
    });
    setPreviousConversationId(null);
    setPreviousMessages([]);
    setPreviousActiveLease(null);
    setPreviousToolEvents([]);
    setStatus('idle');
    setErrorMsg('');
  };

  const handleSubmit = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || status === 'streaming') return;

    // Sending a message commits to the new thread — drop the undo-stash
    // so "Continue previous" doesn't reappear later.
    // Sprint 24.7 — also drop the lease + tool-events snapshot so a
    // committed new thread can't accidentally resurrect the prior lease.
    // The stashed pdfUrl is provably unreachable once the stash is
    // cleared, so this is the right place to revoke the Blob URL.
    if (
      previousConversationId !== null ||
      previousActiveLease !== null ||
      previousToolEvents.length > 0
    ) {
      if (previousActiveLease?.pdfUrl) {
        try {
          URL.revokeObjectURL(previousActiveLease.pdfUrl);
        } catch {
          // revokeObjectURL is best-effort and a no-op in jsdom tests.
        }
      }
      // Sprint 25 — commit boundary: the stash is provably unreachable
      // once cleared, so the cached PDF bytes can also be evicted. The
      // stashed lease_id is what we need; null-checked because the
      // stash can hold only chat thread (no lease) when the user
      // misclicked New without ever uploading.
      if (previousActiveLease?.lease_id) {
        void getPdfBinaryRepository()
          .delete(previousActiveLease.lease_id)
          .catch(() => {});
      }
      setPreviousConversationId(null);
      setPreviousMessages([]);
      setPreviousActiveLease(null);
      setPreviousToolEvents([]);
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
    previousConversationId !== null ||
    previousActiveLease !== null ||
    previousToolEvents.length > 0;
  const showContinuePrevious = !hasMessages && hasPreviousStash && !activeLease;
  const showToolbar = hasMessages || hasPreviousStash;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 w-full flex-1 grid-rows-[auto_minmax(0,1fr)_auto]">
        {/* Conversation toolbar — visible when there's an active thread or
            a stashed previous one (one-click undo for misclicked New). */}
        <div
          data-testid="conversation-toolbar"
          className={`flex shrink-0 items-center justify-end border-b border-gray-100 px-4 py-1.5 ${
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
            <button
              type="button"
              data-testid="new-conversation-btn"
              onClick={handleNewConversation}
              // Sprint 25.2 — formerly disabled during streaming, which
              // gated the user out of R8's escape-hatch flow (clicking
              // New mid-stream is the documented way to abort an
              // in-flight reply and start fresh). handleNewConversation
              // calls abortRef.current?.abort() at the top, so the
              // in-flight fetch cancels cleanly.
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
            >
              <SquarePen className="h-3.5 w-3.5" aria-hidden="true" />
              New conversation
            </button>
          )}
        </div>

        <div role="status" aria-live="polite" className="sr-only">
          {status === 'streaming' && 'Assistant is typing...'}
          {status === 'error' && `Error: ${errorMsg}`}
        </div>

        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <ChatTranscript
            messages={messages}
            isStreaming={status === 'streaming'}
            onSelectPrompt={handleSubmit}
            workspaceName={workspaceName}
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
