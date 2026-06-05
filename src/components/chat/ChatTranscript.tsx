import { useEffect, useMemo, useRef } from 'react';
import { useLeaseParser } from '@/components/lease/LeaseParserContext';
import type { SyntheticAssistantMessage } from '@/components/lease/scan-narrative';
import { UploadedLeaseCard } from '@/components/lease/UploadedLeaseCard';
import { useScanNarrative } from '@/components/lease/use-scan-narrative';
import { FOLLOW_UP_PROMPTS } from '@/lib/chat/follow-up-prompts';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessage, type ChatMessageProps } from './ChatMessage';

export interface ChatTranscriptProps {
  messages: ChatMessageProps[];
  isStreaming?: boolean;
  onSelectPrompt?: (prompt: string) => void;
  workspaceName: string;
  /**
   * Sprint 29.2 — selects the empty-state surface.
   *
   * `'hero'` (default): the full `ChatEmptyState` landing-page hero —
   * "Find what to negotiate, before you sign" plus prompt cards. The
   * right shape for any non-FAB consumer where the chat IS the page
   * (e.g. legacy `LeaseLensWorkspaceShell`).
   *
   * `'compact'`: a small in-drawer header — heading + one-line subhead
   * only. Used inside the FAB drawer so the assistant stops competing
   * with the parser surface for visual weight (Dieter Rams: less but
   * better; Don Norman: secondary tools should look secondary).
   */
  emptyStateVariant?: 'hero' | 'compact';
  /**
   * Sprint 29.4 — override for the compact-variant subhead. Lets the
   * FAB pass job-aware copy ("No lease attached yet…", "Scanning your
   * lease…", "Ask about this lease…") that mirrors the chip set
   * shown below the composer. Ignored when `emptyStateVariant !==
   * 'compact'`. Default is a generic fallback.
   */
  emptyStateSubhead?: string;
  /**
   * Sprint 37.3 — forwarded to each assistant `ChatMessage` so a long
   * answer can offer "Read in full view" (→ the FAB's expanded-reading
   * mode). Undefined for non-FAB consumers / when already expanded.
   */
  onRequestExpand?: () => void;
}

/*
 * S19.4 — pure merge of the real (streamed) messages with the two
 * synthetic messages produced by useScanNarrative. Kept as a helper
 * so the insertion rules read in one place:
 *   - intro is prepended (position 0) when present.
 *   - summary is appended (last position) when present.
 *
 * Returning a fresh array (not splicing the input) keeps React's
 * referential equality predictable across renders.
 */
// S20.7 — heuristic for "did the model produce its own close?". Any
// trailing assistant message with content longer than this threshold
// counts as substantive — long enough that the synthetic summary
// would only stack a contradictory second voice on top. The threshold
// is short enough to skip the synthetic when the model wrote a
// findings list, and long enough that a stray "ok" or "done." still
// falls through to the synthetic safety net.
const SUBSTANTIVE_REPLY_MIN_CHARS = 80;

function modelProducedClosingReply(messages: ChatMessageProps[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return false;
  return (last.content?.trim().length ?? 0) >= SUBSTANTIVE_REPLY_MIN_CHARS;
}

// Sprint 23c Phase 2 — the synthetic-intro source tag is carried through
// the merge so ChatTranscript can route the intro row to UploadedLeaseCard
// (a dedicated visual card) instead of the generic ChatMessage path. The
// summary still routes to ChatMessage as before.
type MergedMessage = ChatMessageProps & {
  synthetic?: true;
  source?: SyntheticAssistantMessage['source'];
};

function mergeSyntheticMessages(
  real: ChatMessageProps[],
  intro: SyntheticAssistantMessage | null,
  summary: SyntheticAssistantMessage | null,
): MergedMessage[] {
  const merged: MergedMessage[] = [];
  if (intro) {
    merged.push({
      id: intro.id,
      role: 'assistant',
      content: intro.content,
      followUpPrompts: intro.followUpPrompts,
      synthetic: true,
      source: intro.source,
    });
  }
  merged.push(...real);
  if (summary) {
    merged.push({
      id: summary.id,
      role: 'assistant',
      content: summary.content,
      followUpPrompts: summary.followUpPrompts,
      synthetic: true,
      source: summary.source,
    });
  }
  return merged;
}

export function ChatTranscript({
  messages,
  isStreaming = false,
  onSelectPrompt,
  workspaceName,
  emptyStateVariant = 'hero',
  emptyStateSubhead = 'Ask about your lease, clauses, red flags, or citations.',
  onRequestExpand,
}: ChatTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);

  const { intro, summary } = useScanNarrative();
  const { activeLease } = useLeaseParser();
  // S20.8 — hold the synthetic back WHILE the assistant is streaming so
  // it doesn't flicker in between "scan events finished" and the model's
  // closing text arriving (flash-and-swap).
  //
  // Sprint 33.A.2 — the complete/partial summary is now a MINIMAL,
  // deterministic receipt ("Scan complete. N findings on the right…").
  // Because it points to the right pane instead of reprinting a tally,
  // it can't contradict the cards, so it is the single source of truth
  // and renders regardless of the model's ack length. This retires the
  // Sprint 20 SUBSTANTIVE_REPLY_MIN_CHARS heuristic for those states —
  // it was the drift vector (a short post-Sprint-33.A ack < 80 chars let
  // the OLD verbose tally re-appear). The 'scan-fatal' copy ("I had
  // trouble completing the scan") CAN still contradict a model that
  // wrongly claims success, so it keeps the S20.7 guard: defer to a
  // substantive model close.
  const effectiveSummary = useMemo(() => {
    if (isStreaming) return null;
    if (!summary) return null;
    if (
      summary.source === 'scan-fatal' &&
      modelProducedClosingReply(messages)
    ) {
      return null;
    }
    return summary;
  }, [messages, summary, isStreaming]);
  const merged = useMemo(
    () => mergeSyntheticMessages(messages, intro, effectiveSummary),
    [messages, intro, effectiveSummary],
  );
  const previousMessageCount = useRef(merged.length);

  // Track user scroll intent: if user scrolls up, unpin; if at bottom, re-pin
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 40;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    pinnedToBottom.current = atBottom;
  };

  // Adapted from docs/_references/ai_mcp_chat_ordo/src/hooks/useChatScroll.ts.
  useEffect(() => {
    // The empty-state branch renders the welcome hero (Sparkle + H1 +
    // starter cards) which is anchored to the top of the pane. Running
    // the pin-to-bottom logic against it scrolls the hero off-screen on
    // mount when the welcome content is taller than the available pane,
    // making the page look "auto-scrolled" the moment it loads.
    if (merged.length === 0) {
      previousMessageCount.current = 0;
      // React reuses the same scroll container across the empty/messages
      // branches (both top-level <div> at the same position). When the
      // previous render was a long transcript scrolled to the bottom,
      // the browser clamps the old scrollTop to the new (smaller) max
      // and the empty-state hero ends up scrolled off the top. Reset
      // to the top explicitly so the welcome state always lands above
      // the fold.
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      return;
    }

    const messageCountChanged = merged.length !== previousMessageCount.current;
    previousMessageCount.current = merged.length;

    if (messageCountChanged) {
      pinnedToBottom.current = true;
    }

    const el = scrollRef.current;
    if (!pinnedToBottom.current || !el) return;

    el.scrollTo({
      top: el.scrollHeight,
      behavior: 'smooth',
    });
  }, [merged]);

  if (merged.length === 0) {
    return (
      <div
        ref={scrollRef}
        data-testid="chat-transcript-scroll"
        className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
      >
        {emptyStateVariant === 'compact' ? (
          // Sprint 29.2 — compact in-drawer header. No prompt cards
          // (the FAB's own `suggestedPrompts` chip row renders below
          // the composer for that role).
          // Sprint 29.4 — subhead is prop-driven so the FAB can swap
          // copy per parser stage (no-lease / mid-scan / scan-complete).
          // Sprint 37.1 — dropped the "LeaseLens Assistant" heading: the
          // drawer chrome header already shows the wordmark, so a second
          // title here was a duplicate (Dieter Rams: less, but better).
          // The orienting subhead now stands alone as the single line of
          // empty-state copy; the Upload CTA + "Try asking" chips below
          // carry the action.
          <header
            data-testid="assistant-drawer-empty-header"
            className="flex flex-col gap-1 px-4 py-4 text-center"
          >
            <p className="text-[13px] leading-relaxed text-balance text-fg-muted">
              {emptyStateSubhead}
            </p>
          </header>
        ) : (
          <ChatEmptyState
            onSelectPrompt={onSelectPrompt}
            workspaceName={workspaceName}
          />
        )}
      </div>
    );
  }

  // Last *real* assistant message — synthetic intro never gets the
  // generic FOLLOW_UP_PROMPTS (it has its own four chips); the
  // summary message already carries its own follow-ups.
  const lastIndex = merged.length - 1;
  const lastIsRealAssistant =
    merged[lastIndex] !== undefined &&
    merged[lastIndex].role === 'assistant' &&
    !merged[lastIndex].synthetic;

  return (
    <div
      ref={scrollRef}
      data-testid="chat-transcript-scroll"
      onScroll={handleScroll}
      className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-5 md:px-8"
    >
      <div className="mx-auto w-full max-w-3xl shrink-0">
        {/* Sprint 27.1 — inter-message gap bumped from space-y-1 (4px,
            visually adjacent) to space-y-3 (12px). With user messages
            now also wearing a card (ChatMessage), the larger gap reads
            as deliberate rhythm rather than crowded text. */}
        <ul className="m-0 list-none space-y-3 p-0 pb-4">
          {merged.map((msg, idx) => {
            // Sprint 23c Phase 2 — route the synthetic intro through the
            // UploadedLeaseCard surface; everything else (real messages +
            // synthetic summary) still goes through ChatMessage.
            if (
              msg.synthetic &&
              msg.source === 'intro' &&
              activeLease &&
              msg.followUpPrompts
            ) {
              return (
                <li key={msg.id}>
                  <UploadedLeaseCard
                    filename={activeLease.filename}
                    pageCount={activeLease.page_count}
                    clauseCount={activeLease.clause_count}
                    prompts={msg.followUpPrompts}
                    onSelectPrompt={(prompt) => onSelectPrompt?.(prompt)}
                  />
                </li>
              );
            }
            return (
              <ChatMessage
                key={msg.id}
                {...msg}
                onSelectPrompt={onSelectPrompt}
                followUpPrompts={
                  msg.followUpPrompts ??
                  (!isStreaming && idx === lastIndex && lastIsRealAssistant
                    ? FOLLOW_UP_PROMPTS
                    : undefined)
                }
                isStreaming={
                  isStreaming && idx === lastIndex && lastIsRealAssistant
                }
                onRequestExpand={onRequestExpand}
              />
            );
          })}
          <div data-testid="transcript-bottom" className="h-1" />
        </ul>
      </div>
    </div>
  );
}
