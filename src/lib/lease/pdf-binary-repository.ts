// Sprint 25 — PDF binary cache for transparent restore.
//
// The chat workspace state survives role switches and cockpit navigation
// via SSR rehydration of toolEvents + active-lease metadata, but the PDF
// binary itself is not server-persisted (spec H4 — tenant lease PDFs
// never round-trip the server). This module caches the bytes locally in
// IndexedDB so the left-pane PdfViewer restores transparently when the
// shell remounts, instead of forcing the user to re-attach.
//
// **Boundary note**: this is a *client-only* cache, scoped to the user's
// browser profile, never sent to the server. It does not conflict with
// spec H4 (no server-side PDF persistence).
//
// Architecture: Repository pattern. Components depend on the interface,
// never on `indexedDB` directly, so SSR + tests can inject a NoopRepo and
// a future swap to OPFS / Cache API touches only this file.

const DB_NAME = 'leaselens-pdf-cache';
const STORE = 'pdf-binaries';
const DB_VERSION = 1;

export interface PdfBinaryRepository {
  /** Stores the PDF binary under the given lease_id. Idempotent. */
  put(leaseId: string, file: Blob): Promise<void>;
  /** Returns the stored Blob, or null when not cached. */
  get(leaseId: string): Promise<Blob | null>;
  /** Removes a single entry (no-op when missing). */
  delete(leaseId: string): Promise<void>;
  /** Removes every entry whose key is not in the keep-list. */
  evictExcept(keepLeaseIds: readonly string[]): Promise<void>;
}

class NoopPdfBinaryRepository implements PdfBinaryRepository {
  async put(): Promise<void> {}
  async get(): Promise<Blob | null> {
    return null;
  }
  async delete(): Promise<void> {}
  async evictExcept(): Promise<void> {}
}

class IndexedDBPdfBinaryRepository implements PdfBinaryRepository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(req.error ?? new Error('IndexedDB open failed'));
    });
    return this.dbPromise;
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T> | null,
  ): Promise<T | null> {
    const db = await this.openDb();
    return new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      const req = fn(store);
      if (!req) {
        tx.oncomplete = () => resolve(null);
        tx.onerror = () => reject(tx.error);
        return;
      }
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async put(leaseId: string, file: Blob): Promise<void> {
    await this.withStore('readwrite', (store) => store.put(file, leaseId));
  }

  async get(leaseId: string): Promise<Blob | null> {
    const result = await this.withStore<Blob>(
      'readonly',
      (store) => store.get(leaseId) as IDBRequest<Blob>,
    );
    return result ?? null;
  }

  async delete(leaseId: string): Promise<void> {
    await this.withStore('readwrite', (store) => store.delete(leaseId));
  }

  async evictExcept(keepLeaseIds: readonly string[]): Promise<void> {
    const keep = new Set(keepLeaseIds);
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string' && !keep.has(cursor.key)) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

let singleton: PdfBinaryRepository | null = null;

/**
 * Lazy singleton accessor. Returns the IndexedDB-backed repository in
 * browsers and a Noop in SSR / non-browser environments (tests can opt
 * into the real repo by providing their own via setPdfBinaryRepository).
 */
export function getPdfBinaryRepository(): PdfBinaryRepository {
  if (singleton) return singleton;
  singleton =
    typeof indexedDB !== 'undefined'
      ? new IndexedDBPdfBinaryRepository()
      : new NoopPdfBinaryRepository();
  return singleton;
}

/**
 * Test-only seam: override the singleton with a stub. Call with `null` to
 * restore the default lazy lookup on the next access.
 */
export function setPdfBinaryRepository(repo: PdfBinaryRepository | null): void {
  singleton = repo;
}
