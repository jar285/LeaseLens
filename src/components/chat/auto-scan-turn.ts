// Sprint 33.A.2 — mark the auto-scan's scan turn so ChatMessage can
// suppress the redundant in-chat ScanTimeline (the right-pane staircase
// is canonical for scan progress). Pure + testable.
//
// Discriminator: the FIRST scan-bearing assistant message in the
// transcript. Per Sprint 33.0 (one conversation per lease scan) the
// auto-scan that fires on upload is always the first scan in a
// conversation, so a user-initiated "scan again" is a LATER scan turn
// and keeps its timeline.
//
// We deliberately do NOT key on `autoScanConversationId`: the silent
// AutoScanRunner never populates ChatUI's message list, so that id is
// only set during the live fetch — and it is null on the reloaded,
// SSR-hydrated conversation, which is the ONE scenario where a persisted
// scan turn actually re-renders an inline timeline. Message position is
// the discriminator that survives a reload.
//
// Reuses SCAN_TOOL_NAMES from ChatMessage rather than redefining it, so
// the "what counts as a scan turn" rule lives in exactly one place.

import { type ChatMessageProps, SCAN_TOOL_NAMES } from './ChatMessage';

function hasScanInvocation(message: ChatMessageProps): boolean {
  return (message.toolInvocations ?? []).some((inv) =>
    SCAN_TOOL_NAMES.has(inv.name),
  );
}

export function markAutoScanTurn(
  messages: ChatMessageProps[],
): ChatMessageProps[] {
  const index = messages.findIndex(
    (m) => m.role === 'assistant' && hasScanInvocation(m),
  );
  if (index === -1) return messages;
  return messages.map((m, i) =>
    i === index ? { ...m, isAutoScanTurn: true } : m,
  );
}
