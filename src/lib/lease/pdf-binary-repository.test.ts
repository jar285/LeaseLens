import { afterEach, describe, expect, it } from 'vitest';
import {
  getPdfBinaryRepository,
  type PdfBinaryRepository,
  setPdfBinaryRepository,
} from './pdf-binary-repository';

afterEach(() => {
  setPdfBinaryRepository(null);
});

describe('getPdfBinaryRepository', () => {
  it('returns a Noop implementation when IndexedDB is not available (SSR / tests)', async () => {
    // happy-dom does not implement indexedDB, so the lazy singleton picks
    // the Noop variant. We assert observable behavior: every method
    // resolves and reads always return null.
    const repo = getPdfBinaryRepository();
    await expect(repo.put('lease-1', new Blob([]))).resolves.toBeUndefined();
    await expect(repo.get('lease-1')).resolves.toBeNull();
    await expect(repo.delete('lease-1')).resolves.toBeUndefined();
    await expect(repo.evictExcept(['lease-1'])).resolves.toBeUndefined();
  });

  it('returns the same singleton across calls (lazy memoization)', () => {
    const a = getPdfBinaryRepository();
    const b = getPdfBinaryRepository();
    expect(a).toBe(b);
  });
});

describe('setPdfBinaryRepository', () => {
  it('overrides the singleton with a test stub', async () => {
    const calls: string[] = [];
    const stub: PdfBinaryRepository = {
      async put(id) {
        calls.push(`put:${id}`);
      },
      async get(id) {
        calls.push(`get:${id}`);
        return new Blob(['fake-bytes']);
      },
      async delete(id) {
        calls.push(`del:${id}`);
      },
      async evictExcept(ids) {
        calls.push(`evict:${ids.join(',')}`);
      },
    };
    setPdfBinaryRepository(stub);

    const repo = getPdfBinaryRepository();
    await repo.put('lease-A', new Blob([]));
    const got = await repo.get('lease-A');
    await repo.delete('lease-A');
    await repo.evictExcept(['lease-A', 'lease-B']);

    expect(got).not.toBeNull();
    expect(calls).toEqual([
      'put:lease-A',
      'get:lease-A',
      'del:lease-A',
      'evict:lease-A,lease-B',
    ]);
  });

  it('passing null clears the override so the next access re-picks the default', () => {
    const stub: PdfBinaryRepository = {
      async put() {},
      async get() {
        return null;
      },
      async delete() {},
      async evictExcept() {},
    };
    setPdfBinaryRepository(stub);
    expect(getPdfBinaryRepository()).toBe(stub);

    setPdfBinaryRepository(null);
    // The next access constructs a fresh default (Noop in this env).
    expect(getPdfBinaryRepository()).not.toBe(stub);
  });
});
