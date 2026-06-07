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
  'RATE_LIMITED',
  'TOOL_FAILED',
  'INTERNAL',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  TOOL_FAILED: 422,
  INTERNAL: 500,
};

const SAFE_MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
  VALIDATION: 'The request was invalid.',
  UNAUTHENTICATED: 'Authentication is required.',
  FORBIDDEN: 'You do not have access to this resource.',
  NOT_FOUND: 'Not found.',
  RATE_LIMITED: 'Too many requests — please slow down.',
  TOOL_FAILED: 'That action could not be completed.',
  INTERNAL: 'Something went wrong on our end.',
};

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  requestId?: string;
}

export function errorResponse(
  code: ApiErrorCode,
  opts?: { requestId?: string; status?: number; message?: string },
): NextResponse {
  const body: ApiErrorBody = {
    error: opts?.message ?? SAFE_MESSAGE_BY_CODE[code],
    code,
    ...(opts?.requestId ? { requestId: opts.requestId } : {}),
  };
  return NextResponse.json(body, {
    status: opts?.status ?? STATUS_BY_CODE[code],
  });
}
