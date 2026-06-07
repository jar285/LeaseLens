// Sprint 44A — structured logger (Pino). Node-only: imported solely by server
// code (route handlers, lib), never middleware (Edge) or client components.
//
// PII posture (Ross Anderson / Adam Shostack): leases carry names, addresses,
// rent, signatures; tool errors can embed a draft-email body or clause text.
// The PRIMARY contract is a structured-event allowlist — call-sites pass only
// typed fields (leaseId, clauseId, toolName, status, requestId, durationMs…),
// never raw content. Redaction here is the belt-and-suspenders backstop, plus a
// custom `err` serializer that drops the raw message and the message-bearing
// stack header (V8 puts the message in the stack's first line).

import {
  type DestinationStream,
  type Logger,
  type LoggerOptions,
  pino,
} from 'pino';
import { env } from '@/lib/env';

// Backstop redaction (the allowlist is the real defense). Censors known PII
// field names + secrets wherever they appear, including one level of nesting.
const REDACT_PATHS = [
  'leaseText',
  'clauseText',
  'clause',
  'clauses',
  'body',
  'subject',
  'draft',
  'email',
  'cookie',
  'headers.cookie',
  'req.headers.cookie',
  'ANTHROPIC_API_KEY',
  'LEASELENS_SESSION_SECRET',
  // Sprint 44 sweep — also censor tool-output content fields a future careless
  // log call might pass (the allowlist is the real defense; this is the net).
  'reasoning',
  'content',
  'result',
  '*.leaseText',
  '*.clauseText',
  '*.body',
  '*.draft',
  '*.reasoning',
  '*.content',
  '*.result',
];

/**
 * Keep only ` at …` call frames — drop the `Name: message` header (and any
 * message lines). V8 embeds the error message in the stack's first line, so an
 * error message interpolated with PII (e.g. a JSON.parse of a draft-email body)
 * must not ride out via the stack.
 */
export function stripErrorMessageFromStack(stack?: string): string | undefined {
  if (!stack) return undefined;
  const frames = stack.split('\n').filter((line) => /^\s*at\s/.test(line));
  return frames.length > 0 ? frames.join('\n') : undefined;
}

/**
 * Error serializer that never emits the raw message. Non-Error values are not
 * echoed (they could be raw PII) — only their type is recorded.
 */
export function serializeError(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) {
    return { type: typeof err, note: 'non-error value omitted' };
  }
  const e = err as Error & { code?: unknown };
  return {
    name: e.name,
    ...(e.code !== undefined ? { code: e.code } : {}),
    stack: stripErrorMessageFromStack(e.stack),
  };
}

const isDev = process.env.NODE_ENV === 'development';

export function createLogger(destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    level: env.LEASELENS_LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    serializers: { err: serializeError },
  };
  // pino-pretty (a worker-thread transport) only for local dev with no explicit
  // destination. Tests pass a destination → plain JSON, no worker. Prod → JSON.
  // colorize is omitted so pino-pretty auto-detects: colored in an interactive
  // terminal, plain when piped to a file (e.g. `npm run dev:log`).
  if (isDev && !destination) {
    return pino({
      ...options,
      transport: { target: 'pino-pretty' },
    });
  }
  return destination ? pino(options, destination) : pino(options);
}

// Sprint 44A — the app-wide singleton. Route handlers derive request-scoped
// loggers via `logger.child({ requestId })` (correlation lands in 44A.2).
export const logger = createLogger();
