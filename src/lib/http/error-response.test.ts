// Sprint 44A.3 — the standard API error envelope: { error, code, requestId }.
// `code` is required + enumerated (machine contract); `error` is a SAFE message
// keyed off the code — never a raw err.message (which can carry PII).

import { describe, expect, it } from 'vitest';
import { errorResponse } from './error-response';

describe('errorResponse', () => {
  it('maps a code to its default status + a safe message, with requestId', async () => {
    const res = errorResponse('INTERNAL', { requestId: 'REQ-1' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe('INTERNAL');
    expect(body.requestId).toBe('REQ-1');
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });

  it('uses per-code default statuses', async () => {
    expect(errorResponse('VALIDATION').status).toBe(400);
    expect(errorResponse('UNAUTHENTICATED').status).toBe(401);
    expect(errorResponse('FORBIDDEN').status).toBe(403);
    expect(errorResponse('RATE_LIMITED').status).toBe(429);
  });

  // Sprint A.8 (#8) — request-guard codes: oversized body/message → 413,
  // request/tool timeout → 408. Both carry a safe, client-facing message.
  it('maps PAYLOAD_TOO_LARGE → 413 and TIMEOUT → 408 with safe messages', async () => {
    expect(errorResponse('PAYLOAD_TOO_LARGE').status).toBe(413);
    expect(errorResponse('TIMEOUT').status).toBe(408);
    const tooLarge = await errorResponse('PAYLOAD_TOO_LARGE').json();
    expect(tooLarge.code).toBe('PAYLOAD_TOO_LARGE');
    expect(typeof tooLarge.error).toBe('string');
    expect(tooLarge.error.length).toBeGreaterThan(0);
    const timeout = await errorResponse('TIMEOUT').json();
    expect(timeout.code).toBe('TIMEOUT');
    expect(timeout.error.length).toBeGreaterThan(0);
  });

  it('omits requestId when not provided', async () => {
    const body = await errorResponse('VALIDATION').json();
    expect(body).not.toHaveProperty('requestId');
    expect(body.code).toBe('VALIDATION');
  });

  it('accepts a caller-authored safe message override', async () => {
    const body = await errorResponse('VALIDATION', {
      message: 'Message is required',
    }).json();
    expect(body.error).toBe('Message is required');
    expect(body.code).toBe('VALIDATION');
  });

  // Sprint C.17 (#17) — RATE_LIMITED carries a Retry-After header (ceil'd secs).
  it('sets a Retry-After header when retryAfterSeconds is provided', () => {
    const res = errorResponse('RATE_LIMITED', { retryAfterSeconds: 42.3 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('43');
  });

  it('omits Retry-After when not provided', () => {
    expect(errorResponse('RATE_LIMITED').headers.get('Retry-After')).toBeNull();
  });

  // Sprint D.12a (#12) — `extra` merges caller-supplied safe fields into the
  // body (e.g. chat's `redirect: '/'` recovery hint) WITHOUT letting them
  // clobber the envelope's own contract keys.
  it('merges extra fields into the body', async () => {
    const body = await errorResponse('UNAUTHENTICATED', {
      requestId: 'REQ-2',
      extra: { redirect: '/' },
    }).json();
    expect(body.redirect).toBe('/');
    expect(body.code).toBe('UNAUTHENTICATED');
    expect(body.requestId).toBe('REQ-2');
  });

  it('extra can never clobber the envelope contract keys', async () => {
    const body = await errorResponse('VALIDATION', {
      extra: { code: 'SPOOFED', error: 'spoofed', requestId: 'spoofed' },
    }).json();
    expect(body.code).toBe('VALIDATION');
    expect(body.error).not.toBe('spoofed');
    expect(body).not.toHaveProperty('requestId');
  });

  // Sprint D.12a (#12) — codes for the raw routes being normalized: the
  // rollback 410 ("tool no longer registered") and the leases 415.
  it('maps GONE → 410 and UNSUPPORTED_MEDIA_TYPE → 415 with safe messages', async () => {
    expect(errorResponse('GONE').status).toBe(410);
    expect(errorResponse('UNSUPPORTED_MEDIA_TYPE').status).toBe(415);
    const gone = await errorResponse('GONE').json();
    expect(gone.code).toBe('GONE');
    expect(gone.error.length).toBeGreaterThan(0);
    const media = await errorResponse('UNSUPPORTED_MEDIA_TYPE').json();
    expect(media.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(media.error.length).toBeGreaterThan(0);
  });
});
