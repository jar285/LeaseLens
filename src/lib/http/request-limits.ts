// Sprint A.8 (#8) — request-size guards as pure predicates.
//
// The route checks these at the trust boundary (Michael Nygard: fail fast;
// Addy Osmani: performance budgets). They're pure functions so the logic is
// deterministically unit-testable — `Content-Length` is a UA-controlled
// (forbidden) request header that test request builders can't reliably set, so
// asserting the guard through a constructed Request is brittle.

/**
 * True when a declared Content-Length exceeds the byte budget. A missing
 * header returns false (chunked/omitted requests are allowed through and
 * bounded by the platform body cap + the message-length guard); a non-numeric
 * header is treated as absent rather than as an overflow.
 */
export function exceedsContentLengthLimit(
  contentLengthHeader: string | null | undefined,
  maxBytes: number,
): boolean {
  if (contentLengthHeader == null) return false;
  const declared = Number(contentLengthHeader);
  return Number.isFinite(declared) && declared > maxBytes;
}

/**
 * True when a (already-parsed) message exceeds the character budget. The empty
 * case is handled separately by the schema's min(1) — this is purely the
 * upper bound.
 */
export function exceedsMessageLength(
  message: string,
  maxChars: number,
): boolean {
  return message.length > maxChars;
}
