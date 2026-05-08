// Sprint 13 §3c — multipart upload validation. Pure function checking
// size + content-type. Page-count is enforced after parsePdf returns
// (different validation surface, different error path).

import { describe, expect, it } from 'vitest';
import { validateLeaseUpload } from './validate-upload';

function makeFile(opts: { name?: string; type?: string; size: number }): File {
  const bytes = new Uint8Array(opts.size);
  return new File([bytes], opts.name ?? 'lease.pdf', {
    type: opts.type ?? 'application/pdf',
  });
}

describe('validateLeaseUpload', () => {
  it('accepts a 100KB application/pdf file', () => {
    const result = validateLeaseUpload(makeFile({ size: 102_400 }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.file).toBeDefined();
    }
  });

  it('rejects a file with a non-PDF content-type', () => {
    const result = validateLeaseUpload(
      makeFile({ size: 1024, type: 'text/plain' }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/content[\s-]type|pdf/i);
    }
  });

  it('rejects a file larger than the configured byte cap', () => {
    // Default cap is 1 MB (1_048_576). 2 MB is well over.
    const result = validateLeaseUpload(makeFile({ size: 2_097_152 }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/size|too\s+large|byte/i);
    }
  });

  it('rejects a missing/null file', () => {
    const result = validateLeaseUpload(null as unknown as File);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/file|missing|required/i);
    }
  });

  it('accepts a file at exactly the byte cap (boundary case)', () => {
    const result = validateLeaseUpload(makeFile({ size: 1_048_576 }));

    expect(result.ok).toBe(true);
  });

  it('rejects an empty file (zero bytes)', () => {
    const result = validateLeaseUpload(makeFile({ size: 0 }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/empty|size/i);
    }
  });
});
