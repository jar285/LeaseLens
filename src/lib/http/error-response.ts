// Sprint 44A.3 — the standard API error envelope. `code` is the machine
// contract (enumerated); `error` is a SAFE, client-facing message keyed off the
// code — NEVER a raw err.message (which can embed lease/clause/draft PII). A
// `message` override is allowed for intentional, developer-authored copy only
// (e.g. "Message is required"), never the caught error's message.

import { NextResponse } from 'next/server';

export const API_ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  // Sprint A.8 (#8) — request-guard codes: oversized body/message (413) and
  // request/tool timeout (408). Michael Nygard: bound the dependency.
  'PAYLOAD_TOO_LARGE',
  'TIMEOUT',
  'RATE_LIMITED',
  'TOOL_FAILED',
  // Sprint D.12a (#12) — codes for the normalized raw routes: rollback's
  // "tool no longer registered" (410) and the lease upload's wrong
  // content-type (415).
  'GONE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INTERNAL',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  TIMEOUT: 408,
  RATE_LIMITED: 429,
  TOOL_FAILED: 422,
  GONE: 410,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL: 500,
};

const SAFE_MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
  VALIDATION: 'The request was invalid.',
  UNAUTHENTICATED: 'Authentication is required.',
  FORBIDDEN: 'You do not have access to this resource.',
  NOT_FOUND: 'Not found.',
  PAYLOAD_TOO_LARGE: 'The request is too large.',
  TIMEOUT: 'The request took too long and was stopped.',
  RATE_LIMITED: 'Too many requests — please slow down.',
  TOOL_FAILED: 'That action could not be completed.',
  GONE: 'This action is no longer available.',
  UNSUPPORTED_MEDIA_TYPE: 'That file type is not supported.',
  INTERNAL: 'Something went wrong on our end.',
};

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  requestId?: string;
}

export function errorResponse(
  code: ApiErrorCode,
  opts?: {
    requestId?: string;
    status?: number;
    message?: string;
    // Sprint C.17 (#17) — when set, emit a `Retry-After` header (seconds). Used
    // by RATE_LIMITED so a client knows how long until the quota window frees.
    retryAfterSeconds?: number;
    // Sprint D.12a (#12) — SAFE caller-authored fields merged into the body
    // (e.g. chat's `redirect: '/'` recovery hint). Spread FIRST so the
    // envelope's contract keys (error/code/requestId) always win — extra can
    // carry hints, never spoof the contract.
    extra?: Record<string, unknown>;
  },
): NextResponse {
  // Strip the contract keys out of `extra` entirely (spread order alone would
  // still let a spoofed requestId through when the caller passes none).
  const {
    error: _e,
    code: _c,
    requestId: _r,
    ...safeExtra
  } = opts?.extra ?? {};
  const body: ApiErrorBody & Record<string, unknown> = {
    ...safeExtra,
    error: opts?.message ?? SAFE_MESSAGE_BY_CODE[code],
    code,
    ...(opts?.requestId ? { requestId: opts.requestId } : {}),
  };
  const res = NextResponse.json(body, {
    status: opts?.status ?? STATUS_BY_CODE[code],
  });
  if (opts?.retryAfterSeconds != null) {
    res.headers.set(
      'Retry-After',
      String(Math.max(0, Math.ceil(opts.retryAfterSeconds))),
    );
  }
  return res;
}
