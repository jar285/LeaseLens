/**
 * Three-dot pulse rendered inside an empty assistant bubble between submit
 * and first stream chunk (or first tool_use). Replaces the floating
 * "Composing response…" overlay (removed in Sprint 9). Spec §4.9 / §7.
 *
 * Visibility owned by ChatMessage's four-clause condition:
 *   isStreaming && role === 'assistant' && !content
 *     && (toolInvocations === undefined || toolInvocations.length === 0)
 *
 * Sprint 15 Phase 5 — accent-token recolour.
 */
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Assistant is composing"
      className="flex items-center gap-1.5 py-2"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-bounce dark:bg-accent-300"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
