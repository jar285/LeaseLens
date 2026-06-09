// Sprint 44A.2 — server-side request correlation. Reads the id the middleware
// forwarded onto the request headers (Next 16 `headers()` is async) and yields a
// request-scoped child logger. Server-only (imports the Pino logger), so never
// import this from middleware or a client component.

import { headers } from 'next/headers';
import { logger } from './logger';
import { REQUEST_ID_HEADER } from './request-id';

export async function getRequestId(): Promise<string | undefined> {
  return (await headers()).get(REQUEST_ID_HEADER) ?? undefined;
}

/** A logger bound to the current request's correlation id, for server
 *  components / route handlers that don't already hold `req`. */
export async function getRequestLogger() {
  return logger.child({ requestId: await getRequestId() });
}
