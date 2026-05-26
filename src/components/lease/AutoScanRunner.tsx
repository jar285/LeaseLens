// Sprint 26c.10 — auto-scan-on-upload runner.
//
// Silent assistant: when mounted with `enabled=true` and the active
// lease has not yet been scanned (no `extract_clauses` tool event for
// it), AutoScanRunner fires the canonical STANDARD_SCAN_PROMPT to
// /api/chat and routes the resulting NDJSON tool_result events into
// ChatStreamContext via `appendToolEvent`. RedFlagReport, ClausesList,
// and ScanTimeline (which all consume `useChatStream()`) populate
// automatically — no FAB drawer pops open, no chat surface mounts.
//
// Sprint 26c.11 — strict-mode-safe fire guard.
//
// Earlier revision used a per-instance `useRef` guard + an
// `AbortController` cleanup. In `next dev` with React 19's mount-
// cleanup-remount dev pass, that combination killed every in-flight
// stream: first mount started the fetch and set the ref; cleanup
// aborted the controller before the stream's reader read anything;
// the remount's effect saw the ref already set and skipped re-firing.
// Net result: the message hit the server (and the scan ran on the
// backend), but the client received zero tool_result events.
//
// Fix: a module-level `Set<string>` tracks lease_ids that have been
// fired in this page session, and we drop the cleanup abort entirely.
// The fetch runs to completion regardless of mount cycles; the
// module-level guard prevents duplicate fires across remounts. If the
// component truly unmounts mid-scan (e.g. the user clicks Replace),
// the in-flight fetch's response events land in a stale closure that
// no longer has a live `appendToolEvent` — they're discarded silently
// without crashing.
//
// Sprint 26c.11 — also captures the server's `{conversationId}` stream
// envelope and broadcasts it via ChatStreamContext so the FAB's
// ChatUI can adopt the same thread when the user opens it later.
// Without this sync, the user's auto-scan and the FAB's manual chat
// would diverge into two separate conversations.

'use client';

import { useEffect } from 'react';
import { useChatStream } from '@/components/chat/ChatStreamContext';
import { STANDARD_SCAN_PROMPT } from '@/lib/chat/follow-up-prompts';
import { parseStreamLine } from '@/lib/chat/parse-stream-line';
import { useLeaseParser } from './LeaseParserContext';
import { partitionByLatestExtract } from './use-scan-progress';

export interface AutoScanRunnerProps {
  /**
   * Master switch. Wired from `env.LEASELENS_AUTO_SCAN_ENABLED` via
   * server props in src/app/page.tsx so deployments can disable the
   * auto-fire without code changes.
   */
  enabled: boolean;
  /**
   * Forwarded to the /api/chat POST body. May be null on a brand-new
   * conversation; the server creates one on first message and returns
   * the new id in the stream's first `{conversationId}` envelope —
   * we capture it and surface via context so the FAB's ChatUI can
   * pick up the same thread on its next render.
   */
  conversationId: string | null;
}

// Module-level guard: which lease_ids have we already kicked an
// auto-scan for in this page session? Strict-mode mount-cleanup-
// remount cycles repeat the effect, but the Set persists across
// them — so we fire exactly once per lease per session even with
// dev-mode double-mounts.
const STARTED_AUTO_SCAN_LEASE_IDS = new Set<string>();

/**
 * Test-only escape hatch to clear the module-level guard between
 * specs. Exported under a `__` prefix so it's clearly not part of
 * the runtime API.
 */
export function __resetAutoScanFiredLeases(): void {
  STARTED_AUTO_SCAN_LEASE_IDS.clear();
}

export function AutoScanRunner({
  enabled,
  conversationId,
}: AutoScanRunnerProps): null {
  // Parser state lives in LeaseParserContext after Sprint 3; conversationId
  // handoff stays on ChatStreamContext since it's a chat-thread concern.
  const { activeLease, toolEvents, appendToolEvent } = useLeaseParser();
  const { setAutoScanConversationId } = useChatStream();

  useEffect(() => {
    if (!enabled) return;
    if (!activeLease) return;
    const leaseId = activeLease.lease_id;

    // Module-level guard: another mount instance (or a strict-mode
    // remount of THIS instance) already started a scan for this
    // lease. Don't double-fire.
    if (STARTED_AUTO_SCAN_LEASE_IDS.has(leaseId)) return;

    // Already scanned (rehydrated from a prior session, or an earlier
    // fire visible in toolEvents). Don't re-fire.
    const { extract } = partitionByLatestExtract(toolEvents, leaseId);
    if (extract) {
      STARTED_AUTO_SCAN_LEASE_IDS.add(leaseId);
      return;
    }

    // Mark BEFORE the fetch starts so re-renders / remounts in the
    // same paint can't sneak through.
    STARTED_AUTO_SCAN_LEASE_IDS.add(leaseId);

    // Sprint 28.5 (Bug 2 follow-up) — track tool_use envelopes so we
    // can preserve their `input` args when the matching tool_result
    // lands. Earlier revisions discarded tool_use entirely and pushed
    // `input: {}` on every tool_event, which left `useScanProgress`
    // counting zero attempts (it reads input.clause_id) and the header
    // parked on a spinner indefinitely. Map is scoped per fetch so
    // concurrent scans (shouldn't happen given the guard above, but
    // defensive) don't cross-pollute.
    const pendingToolUseInputs = new Map<string, Record<string, unknown>>();

    void (async () => {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: STANDARD_SCAN_PROMPT,
            conversationId,
          }),
          // No AbortController signal — we want the stream to run to
          // completion even if the React effect's cleanup fires from
          // a strict-mode remount. See module header.
        });
        if (!response.ok || !response.body) return;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
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
            if (!data) continue;
            if ('conversationId' in data) {
              // Sprint 26c.11 — surface the new conversationId so the
              // FAB's ChatUI can adopt the same thread when the user
              // opens it later. Safe to call even if nobody's
              // listening; the setter is a no-op write to React state.
              setAutoScanConversationId(data.conversationId);
            } else if ('tool_use' in data) {
              // Sprint 28.5 — stash the tool_use input so the matching
              // tool_result can carry it through. Without this, every
              // pushed event had input: {} and useScanProgress could
              // not count grading attempts (Bug 2 header-spinner).
              pendingToolUseInputs.set(data.tool_use.id, data.tool_use.input);
            } else if ('tool_result' in data) {
              const input = pendingToolUseInputs.get(data.tool_result.id) ?? {};
              pendingToolUseInputs.delete(data.tool_result.id);
              appendToolEvent({
                tool_name: data.tool_result.name,
                input,
                result: data.tool_result.result,
                audit_id: data.tool_result.audit_id,
              });
            }
            // chunk / truncated / error / quota envelopes are
            // intentionally ignored — the auto-scan doesn't render a
            // chat transcript.
          }
        }
      } catch {
        // Silent failure: the user can still trigger a manual scan
        // via the FAB. An auto-scan error shouldn't bubble UI noise
        // because the user didn't ask for the scan explicitly.
      }
    })();

    // Intentionally no cleanup. See module header — strict-mode
    // remounts must not kill the in-flight stream.
  }, [
    enabled,
    activeLease,
    conversationId,
    toolEvents,
    appendToolEvent,
    setAutoScanConversationId,
  ]);

  return null;
}
