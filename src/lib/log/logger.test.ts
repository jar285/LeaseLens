// Sprint 44A — logger core. The load-bearing test is the PII guardrail: leases
// contain names/addresses/rent, and tool errors can embed a draft-email body or
// clause text. The logger must (a) redact known PII/secret paths, (b) never echo
// a raw error message or a message-bearing stack, and (c) pass typed allowlist
// fields through. Captured via an in-memory destination stream.

import { describe, expect, it } from 'vitest';
import {
  createLogger,
  serializeError,
  stripErrorMessageFromStack,
} from './logger';

function capture() {
  const lines: string[] = [];
  return {
    stream: { write: (s: string) => void lines.push(s) },
    lines,
    json: () => lines.map((l) => JSON.parse(l)),
    raw: () => lines.join(''),
  };
}

describe('logger core', () => {
  it('defaults to the info level and filters lower levels', () => {
    const cap = capture();
    const log = createLogger(cap.stream);
    expect(log.level).toBe('info');
    log.debug('below-threshold');
    expect(cap.lines).toHaveLength(0);
    log.info('at-threshold');
    expect(cap.lines).toHaveLength(1);
  });

  it('redacts PII + secret paths, never emitting the raw value', () => {
    const cap = capture();
    const log = createLogger(cap.stream);
    log.info(
      { leaseText: 'SUPER-SECRET-LEASE', ANTHROPIC_API_KEY: 'sk-ant-XYZ' },
      'parsed',
    );
    const obj = cap.json()[0];
    expect(obj.leaseText).toBe('[redacted]');
    expect(cap.raw()).not.toContain('SUPER-SECRET-LEASE');
    expect(cap.raw()).not.toContain('sk-ant-XYZ');
  });

  it('redacts the Sprint 44 sweep content paths (reasoning/content/result)', () => {
    const cap = capture();
    const log = createLogger(cap.stream);
    log.info(
      {
        reasoning: 'REASONING-PII',
        content: 'CONTENT-PII',
        result: { body: 'BODY-PII' },
      },
      'tool.output',
    );
    const raw = cap.raw();
    expect(raw).not.toContain('REASONING-PII');
    expect(raw).not.toContain('CONTENT-PII');
    expect(raw).not.toContain('BODY-PII');
  });

  it('serializes errors without the raw message or a message-bearing stack', () => {
    const cap = capture();
    const log = createLogger(cap.stream);
    log.error({ err: new Error('DRAFT-BODY-PII-xyz') }, 'tool failed');
    const obj = cap.json().at(-1);
    expect(cap.raw()).toContain('tool failed'); // the safe log message survives
    expect(obj.err.name).toBe('Error');
    expect(obj.err).not.toHaveProperty('message'); // raw message dropped
    expect(cap.raw()).not.toContain('DRAFT-BODY-PII-xyz'); // not via msg OR stack
  });

  it('does not echo a non-Error err value (could be raw PII)', () => {
    const cap = capture();
    const log = createLogger(cap.stream);
    log.error({ err: 'RAW-PII-STRING' }, 'odd error');
    expect(cap.raw()).not.toContain('RAW-PII-STRING');
  });

  it('passes typed allowlist fields through (the real logging contract)', () => {
    const cap = capture();
    const log = createLogger(cap.stream);
    log.info(
      { leaseId: 'L1', clauseId: 'C2', toolName: 'grade', status: 'error' },
      'tool.execute',
    );
    const obj = cap.json().at(-1);
    expect(obj.leaseId).toBe('L1');
    expect(obj.toolName).toBe('grade');
    expect(obj.status).toBe('error');
  });

  it('child loggers carry bindings (supports requestId correlation)', () => {
    const cap = capture();
    const child = createLogger(cap.stream).child({ requestId: 'REQ-1' });
    child.info('hi');
    expect(cap.json().at(-1).requestId).toBe('REQ-1');
  });

  it('stripErrorMessageFromStack keeps only call frames', () => {
    const stack =
      'Error: secret-in-message\n    at foo (/a/b.ts:1:2)\n    at bar (/c/d.ts:3:4)';
    const out = stripErrorMessageFromStack(stack);
    expect(out).not.toContain('secret-in-message');
    expect(out).toContain('at foo (/a/b.ts:1:2)');
    expect(out).toContain('at bar (/c/d.ts:3:4)');
  });

  it('serializeError refuses to echo a non-Error', () => {
    expect(JSON.stringify(serializeError('RAW-PII'))).not.toContain('RAW-PII');
  });
});
