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
});
