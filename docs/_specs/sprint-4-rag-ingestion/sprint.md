# Sprint Plan — Sprint 4: Seed Corpus + RAG Ingestion Foundation

**Sprint:** 4  
**Status:** Complete  
**Date:** 2026-04-28

---

## Prerequisites

Before any implementation step, verify the `@huggingface/transformers` package version and API shape in the installed version. The pipeline API changed between v2 and v3. Confirm `pipeline()` signature and `pooling`/`normalize` options against the version installed in this sprint.

---

## Files To Create

| File | Purpose |
|------|---------|
| `src/corpus/brand-identity.md` | Seed document 1 |
| `src/corpus/content-pillars.md` | Seed document 2 |
| `src/corpus/audience-profile.md` | Seed document 3 |
| `src/corpus/style-guide.md` | Seed document 4 |
| `src/corpus/content-calendar.md` | Seed document 5 |
| `src/lib/rag/chunk-document.ts` | Heading-aware markdown chunker |
| `src/lib/rag/chunk-document.test.ts` | Unit tests for chunker |
| `src/lib/rag/embed.ts` | Local WASM embedder wrapper |
| `src/lib/rag/ingest.ts` | Ingestion pipeline |
| `src/lib/rag/ingest.test.ts` | Unit tests for ingestion pipeline |

## Files To Modify

| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add `documents` and `chunks` table DDL |
| `src/lib/db/schema.test.ts` | Assert `documents` and `chunks` tables + columns |
| `src/db/seed.ts` | Call `ingestCorpus(db)` after user seed |
| `package.json` | Add `@huggingface/transformers` to `dependencies` |

---

## Tasks

### Task 1 — Install `@huggingface/transformers`

```
npm install @huggingface/transformers
```

Verify the installed version in `package.json`. Confirm the pipeline API in the installed version before proceeding to Task 5.

Run: `npm run typecheck` — must pass before continuing.

---

### Task 2 — Schema additions (`src/lib/db/schema.ts`)

Append to the `SCHEMA` string (after the existing `rate_limit` table):

```sql
CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  slug         TEXT UNIQUE NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES documents(id),
  chunk_index     INTEGER NOT NULL,
  chunk_level     TEXT NOT NULL CHECK(chunk_level IN ('document', 'section', 'passage')),
  heading         TEXT,
  content         TEXT NOT NULL,
  embedding       BLOB,
  embedding_model TEXT,
  created_at      INTEGER NOT NULL
);
```

No changes to any existing table.

Run: `npm run typecheck && npm run lint` after this task.

---

### Task 3 — Schema test update (`src/lib/db/schema.test.ts`)

Extend the existing `'should have all five tables with expected columns'` test to assert `documents` and `chunks` are present. Add a second assertion block verifying key columns on each:

- `documents`: `id`, `slug`, `title`, `content`, `content_hash`
- `chunks`: `id`, `document_id`, `chunk_index`, `chunk_level`, `heading`, `content`, `embedding`

Also update the test description from `'should have all five tables'` to `'should have all seven tables with expected columns'`.

Run: `npm run test` — all 57 existing tests plus the updated schema test must pass.

---

### Task 4 — Seed corpus (`src/corpus/`)

Create five markdown files. Each must be at least 400 words with `## ` section headings so the chunker produces multiple section-level chunks. Content must be substantive — specific enough to answer realistic content-ops questions in Sprint 5.

**`brand-identity.md`** — Side Quest Syndicate brand story, mission statement, core values (min 3), brand voice description, visual identity notes (color palette, typography approach), what the brand is not.

**`content-pillars.md`** — Five named content pillars with a 2–3 sentence description each, example post formats per pillar, and success metrics per pillar.

**`audience-profile.md`** — Primary and secondary audience segments, demographics, platform preferences (which social platforms, when), content consumption habits, what the audience wants from Side Quest Syndicate vs. what they can get elsewhere.

**`style-guide.md`** — Tone of voice (formal vs. casual, humor policy), vocabulary rules (gaming jargon to use vs. avoid), sentence length and formatting standards, headline formula, do/don't examples (at least 5 each).

**`content-calendar.md`** — Weekly content cadence (which post type each day), content types and formats per day, approval workflow steps (draft → review → approve → schedule), first-week content plan with specific post ideas.

No minimum on section count, but each document must have at least three `## ` headings.

---

### Task 5 — Chunker (`src/lib/rag/chunk-document.ts`)

Implement `chunkDocument(slug, title, content): ChunkInput[]`.

```ts
export interface ChunkInput {
  id: string;           // '{slug}#{level}:{index}'
  level: 'document' | 'section' | 'passage';
  heading: string | null;
  content: string;
  embeddingInput: string;
}

export function chunkDocument(
  slug: string,
  title: string,
  content: string,
): ChunkInput[]
```

Rules (see spec §3.6):
1. One `document` chunk: first 2000 chars, `embeddingInput` = title + heading list + first 500 chars stripped.
2. Split on `## ` headings → `section` chunks (≤ 400 words).
3. Sections > 400 words → split on `### ` or `\n\n` → `passage` chunks.
4. Merge chunks < 30 words into previous.
5. No splits inside fenced code blocks (track `` ``` `` open/close state).
6. `embeddingInput` strips markdown: remove `#`, `**`, `*`, `` ` ``, `>`, `-` list markers; prefix with `'{title}: {heading} > '`.

IDs: `'{slug}#document:0'`, `'{slug}#section:0'`, `'{slug}#section:1'`, `'{slug}#passage:0'`, etc. — indices in the `id` string are local within each level for readability.

`chunk_index` stored in the DB column is the **global position** in the full array returned by `chunkDocument()` (0, 1, 2... across all levels). This makes it a reliable ORDER BY key in Sprint 5 retrieval.

Reference pattern: `docs/_references/ai_mcp_chat_ordo/src/core/search/MarkdownChunker.ts` — use the `splitOnHeadings`, `splitPreservingAtomicBlocks`, and `mergeUndersized` patterns; omit conversation source handling, metadata hierarchy, and concept keywords.

---

### Task 6 — Chunker tests (`src/lib/rag/chunk-document.test.ts`)

Six tests, each asserting behavior not structure:

1. **Heading split** — document with two `## ` sections produces one document chunk + two section chunks (3 total minimum).
2. **Oversized section split** — a single section > 400 words produces at least one passage chunk.
3. **Undersized merge** — a section < 30 words is merged into the preceding chunk (does not appear as its own entry).
4. **Code block preservation** — content with a `## ` heading inside a fenced code block is not treated as a section boundary.
5. **Empty input** — `chunkDocument('slug', 'Title', '')` returns exactly one document-level chunk with empty content.
6. **ID format** — all returned chunk IDs match the pattern `'{slug}#{level}:{index}'`.

Run: `npm run test` — all tests must pass before Task 7.

---

### Task 7 — Embedder (`src/lib/rag/embed.ts`)

```ts
export async function embedBatch(texts: string[]): Promise<number[][]>
```

- Module-level lazy singleton: load `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')` on first call, reuse thereafter.
- Pass `{ pooling: 'mean', normalize: false }` — verify these option names against the installed `@huggingface/transformers` version.
- L2-normalise each vector. Compute `norm = Math.sqrt(sum of squares)`. Guard: `if (norm === 0) return vector unchanged`. Otherwise `result[i] = v[i] / norm`. Adapted from `docs/_references/ai_mcp_chat_ordo/src/core/search/l2Normalize.ts`.
- Return `number[][]` (one array per input text).
- Empty input (`texts.length === 0`) → return `[]` immediately without loading the model.

The embedder is **not unit-tested** in this sprint (loading a 23MB model in Vitest is impractical). It is exercised end-to-end by `npm run db:seed`. Mock it in `ingest.test.ts` (Task 9).

---

### Task 8 — Ingestion pipeline (`src/lib/rag/ingest.ts`)

```ts
export async function ingestCorpus(db: Database.Database): Promise<void>
```

Steps:
1. Read all `.md` files from `src/corpus/` using `fs.readdirSync` / `fs.readFileSync`.
2. Derive `slug` from filename (strip `.md`), `title` from first `# ` heading line or slug if none.
3. Compute `content_hash = createHash('sha256').update(content).digest('hex')`.
4. Query `documents` table: if row exists with matching `slug` AND `content_hash` → log `'{slug}: unchanged, skipping'` and continue.
5. Call `chunkDocument(slug, title, content)`.
6. Call `embedBatch(chunks.map(c => c.embeddingInput))`.
7. Resolve stable document id **before** the transaction:
   - `const existing = db.prepare('SELECT id FROM documents WHERE slug = ?').get(slug)`
   - If `existing`: use `existing.id`. If not: generate a new `crypto.randomUUID()`.
8. In a single `db.transaction()`:
   - If updating existing: `UPDATE documents SET title=?, content=?, content_hash=?, created_at=? WHERE id=?`. Then `DELETE FROM chunks WHERE document_id = ?` (using the stable id).
   - If inserting new: `INSERT INTO documents (id, slug, title, content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`.
   - For each chunk: `INSERT INTO chunks` with id, document_id (stable), chunk_index (global position in array), chunk_level, heading, content, `Buffer.from(new Float32Array(vector).buffer)`, `'all-MiniLM-L6-v2'`, `Date.now()`.
9. Log `'{slug}: {n} chunks embedded'`.

Import `embedBatch` from `./embed` and `chunkDocument` from `./chunk-document`. Use `@/lib/env` for nothing (no env vars needed).

---

### Task 9 — Ingestion tests (`src/lib/rag/ingest.test.ts`)

Mock `../embed` module to return deterministic 384-dim vectors using a text-derived pattern (adapted from `docs/_references/ai_mcp_chat_ordo/src/adapters/MockEmbedder.ts`): `vec[i] = ((text.charCodeAt(i % text.length) + i) % 100) / 100`, then L2-normalise. Return as `number[][]`. This produces distinct, unit-norm vectors per input text. Mock `fs` reads to return synthetic markdown. Four tests:

1. **New document** — ingesting a new slug creates one `documents` row and N `chunks` rows.
2. **Idempotency** — ingesting the same slug + same content_hash a second time makes no DB writes (SELECT count unchanged).
3. **Changed content** — ingesting same slug with new content (different hash) replaces old chunks (old chunks deleted, new ones inserted).
4. **Embedding stored** — each inserted chunk has a non-null `embedding` BLOB with `byteLength === 384 * 4` (1536).

Use an in-memory SQLite DB (`new Database(':memory:')`) + `db.exec(SCHEMA)` to isolate tests. Do not write to the filesystem DB.

Run: `npm run test` — all tests must pass.

---

### Task 10 — Seed script extension (`src/db/seed.ts`)

After the existing `runSeed(seedDb)` call in the `if (require.main === module)` block, add:

```ts
await ingestCorpus(seedDb);
```

Import `ingestCorpus` from `@/lib/rag/ingest` at the top of the file. Wrap the main block in an async IIFE:

```ts
if (require.main === module) {
  (async () => {
    const seedDb = new Database(env.CONTENTOPS_DB_PATH);
    console.log('Seeding database...');
    try {
      runSeed(seedDb);
      await ingestCorpus(seedDb);
      console.log('Database seeding complete.');
    } catch (error) {
      console.error('Seeding failed:', error);
      process.exit(1);
    } finally {
      seedDb.close();
    }
  })();
}
```

Run: `npm run db:seed` — watch the console output for per-document chunk counts. Verify with SQLite queries (see §5 below).

---

### Task 11 — Final verification

```
npm run typecheck
npm run lint
npm run test
npm run db:seed
```

After `db:seed`, run these SQLite queries:

```sql
SELECT COUNT(*) FROM documents;
-- expected: 5

SELECT d.slug, COUNT(c.id) as chunk_count
FROM documents d
JOIN chunks c ON c.document_id = d.id
GROUP BY d.slug;
-- expected: each slug has >= 3 chunks

SELECT length(embedding) FROM chunks LIMIT 1;
-- expected: 1536
```

---

## Completion Checklist

- [x] `@huggingface/transformers` installed and in `package.json`.
- [x] `documents` and `chunks` tables in `schema.ts`.
- [x] `schema.test.ts` asserts both new tables and their key columns.
- [x] Five corpus `.md` files in `src/corpus/`, each ≥ 400 words with ≥ 3 `## ` headings.
- [x] `chunk-document.ts`: heading split, passage split, merge, code-block guard, `embeddingInput` prefix.
- [x] `chunk-document.test.ts`: 6 tests, all passing.
- [x] `embed.ts`: lazy singleton, L2 normalisation, empty-input guard.
- [x] `ingest.ts`: idempotency, transaction, BLOB serialisation, per-doc log.
- [x] `ingest.test.ts`: 4 tests with mocked embedder and in-memory DB, all passing.
- [x] `seed.ts` calls `ingestCorpus(db)` and script is async.
- [x] `npm run typecheck` — zero errors.
- [x] `npm run lint` — zero errors.
- [x] `npm run test` — all tests pass (67 total).
- [x] `npm run db:seed` — 5 documents, ≥ 3 chunks each, `length(embedding) = 1536`.

---

## Commit Strategy

- **Task 1–3:** `feat(s4): add @huggingface/transformers + documents/chunks schema`
- **Task 4:** `feat(s4): seed corpus — 5 Side Quest Syndicate markdown documents`
- **Task 5–6:** `feat(s4): chunk-document — heading-aware markdown chunker + tests`
- **Task 7–9:** `feat(s4): embed + ingest pipeline with idempotency + tests`
- **Task 10–11:** `feat(s4): extend db:seed to ingest corpus`
