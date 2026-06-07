// Sprint 44A.2 — request-correlation primitives. Logger-FREE on purpose: the
// Edge middleware imports the header name from here, and must NOT pull in the
// Pino logger (Node-only). Keep this module dependency-free.

export const REQUEST_ID_HEADER = 'x-request-id';

/** Read the correlation id off a request's headers (sync; for route handlers
 *  that already hold `req`). */
export function requestIdFrom(headers: Headers): string | undefined {
  return headers.get(REQUEST_ID_HEADER) ?? undefined;
}
