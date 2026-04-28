# Spec — Sprint 4: Seed Corpus + RAG Ingestion Foundation

**Sprint:** 4  
**Status:** Draft  
**Date:** 2026-04-28

---

## 1. Problem Statement

The chat assistant currently answers from the model's general knowledge only. Sprint 5 will add retrieval-augmented generation (RAG), grounding responses in Side Quest Syndicate's onboarding materials. Sprint 4 establishes the foundation that Sprint 5 depends on:

1. A seed corpus of five markdown documents describing Side Quest Syndicate.
2. A chunking module that splits documents into bounded, heading-aware segments.
3. An embedding module that uses a local WASM model (`all-MiniLM-L6-v2`) to produce 384-dim vectors for each chunk — no API key required.
4. SQLite tables (`documents`, `chunks`) that store documents, chunks, and their embeddings.
5. An ingestion pipeline that is idempotent (skip unchanged documents) and runs at seed time.

Sprint 4 does not add retrieval or grounded chat. Those are Sprint 5.

---

## 2. Invariants

### From Charter

- All persistent state lives in SQLite via `better-sqlite3`. No Postgres, no external DB.
- The seed corpus is read-only on the deployed demo. Visitors cannot upload or modify documents.
- Every sprint produces a spec, sprint doc, and QA report in `docs/_specs/`.
- Automated tests assert behavior; no snapshot or count-padding tests.

### Sprint-Local Invariants

- **Idempotent ingestion.** Running `npm run db:seed` twice on an unchanged corpus must produce the same database state and must not reload the embedding model or re-embed chunks unnecessarily.
- **No breaking changes to existing schema.** `documents` and `chunks` are new tables; existing tables are not modified.
- **Corpus is source-controlled markdown.** The five seed documents live in `src/corpus/` and are committed to the repository.

---

## 3. Architecture

### 3.1 New Dependency

| Package | Version | Purpose |
|---------|---------|-------|
| `@huggingface/transformers` | `^3.x` | Local WASM embedding model — no API key, free, offline-capable after first download |

Add to `dependencies` in `package.json`. Verify exact current version before writing implementation code.

Embedding model: `Xenova/all-MiniLM-L6-v2` — 384-dimensional vectors, runs locally via WASM, downloaded from HuggingFace CDN on first use and cached. No API key required.

Reference: `docs/_references/ai_mcp_chat_ordo/src/adapters/LocalEmbedder.ts` — ContentOps uses the same model and lazy-loading singleton pattern.

### 3.2 New Environment Variables

No new environment variables. The local `Xenova/all-MiniLM-L6-v2` model requires no API key. `src/lib/env.ts` is unchanged.

### 3.3 Schema Additions (`src/lib/db/schema.ts`)

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

`embedding` stores a 32-bit float array serialised as a BLOB (`Float32Array` → `Buffer`). Always populated after ingestion (local model, no API key needed). `embedding_model` stores `'all-MiniLM-L6-v2'`.

### 3.4 Seed Corpus (`src/corpus/`)

Five markdown documents committed to the repository:

| File | Title | Purpose |
|------|-------|---------|
| `brand-identity.md` | Side Quest Syndicate — Brand Identity | Mission, values, brand voice, visual identity guidelines |
| `content-pillars.md` | Side Quest Syndicate — Content Pillars | Five content categories: Reviews, Guides, News, Community, Streams |
| `audience-profile.md` | Side Quest Syndicate — Audience Profile | Demographics, psychographics, platform preferences, engagement patterns |
| `style-guide.md` | Side Quest Syndicate — Style Guide | Tone of voice, vocabulary rules, formatting standards, do/don't examples |
| `content-calendar.md` | Side Quest Syndicate — Content Calendar Template | Weekly cadence, post types per day, approval workflow, first-week plan |

Each document must be at least 400 words so the chunker produces multiple meaningful chunks across heading boundaries. Content must be substantive enough to answer realistic content operations questions in Sprint 5.

### 3.5 Module Layout

```
src/
  corpus/
    brand-identity.md
    content-pillars.md
    audience-profile.md
    style-guide.md
    content-calendar.md
  lib/
    rag/
      chunk-document.ts     # pure function: string → ChunkInput[]
      embed.ts              # local WASM embedder wrapper (@huggingface/transformers)
      ingest.ts             # pipeline: read corpus → chunk → embed → upsert
  db/
    seed.ts                 # extended to call ingestCorpus(db) after user seed
```

### 3.6 `chunk-document.ts`

**Signature:**
```ts
export interface ChunkInput {
  id: string;           // '{slug}#{level}:{index}'
  level: 'document' | 'section' | 'passage';
  heading: string | null;
  content: string;
  embeddingInput: string; // stripped, prefixed text for embedding
}

export function chunkDocument(
  slug: string,
  title: string,
  content: string,
): ChunkInput[]
```

**Chunking rules (adapted from Ordo's `MarkdownChunker`):**

1. Always produce one `document`-level chunk: first 2000 characters of content, heading list prepended.
2. Split remaining content on `## ` headings → one `section` chunk per `##` section if ≤ 400 words.
3. If a section exceeds 400 words, split it further on `### ` headings or paragraph breaks (`\n\n`) → `passage` chunks.
4. Merge any chunk below 30 words into the preceding chunk.
5. Never split inside fenced code blocks.
6. `embeddingInput` = `'{title}: {heading} > {stripped_content}'` with all markdown syntax removed.

Reference: adapted from `docs/_references/ai_mcp_chat_ordo/src/core/search/MarkdownChunker.ts` — simplified to remove conversation source type, chunk metadata hierarchy, and concept keyword extraction. ContentOps has one source type (document) and does not require cross-chunk navigation links at this stage.

### 3.7 `embed.ts`

```ts
export async function embedBatch(texts: string[]): Promise<number[][]>
```

- Lazily loads `Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers` `pipeline('feature-extraction', ...)` on first call. Subsequent calls reuse the cached pipeline.
- Calls `pipe(texts, { pooling: 'mean', normalize: false })` to produce 384-dim vectors.
- L2-normalises each vector before returning. Formula: `v[i] / sqrt(sum(v[j]^2))`. Ensures cosine similarity = dot product in Sprint 5.
- On error → throws with descriptive message (caller handles abort).

Singleton pattern: module-level `let pipeline: Pipeline | null = null` — shared across the seed script process.

Note: First call downloads the model (~23MB) from HuggingFace CDN. Subsequent runs use the local cache. No API key, no cost.

### 3.8 `ingest.ts`

```ts
export async function ingestCorpus(db: Database.Database): Promise<void>
```

Steps:
1. Enumerate all `.md` files in `src/corpus/`.
2. For each file: read content, compute `SHA-256(content)` hex digest.
3. Check `documents` table: if row exists with same `slug` and `content_hash` → skip.
4. Call `chunkDocument(slug, title, content)` to produce `ChunkInput[]`.
5. Call `embedBatch([...embeddingInputs])` to produce vectors (local model, no API key).
6. Inside a `db.transaction()`:
   - Upsert `documents` row (insert or replace by slug).
   - Delete existing `chunks` for this `document_id`.
   - Insert new `chunks` rows with embeddings serialised as `Buffer.from(new Float32Array(vector).buffer)`.
7. Log result per document: `{slug}: {n} chunks, {embedded|skipped}`.

### 3.9 Seed Script Extension (`src/db/seed.ts`)

After the existing user-seed logic, call:

```ts
import { ingestCorpus } from '@/lib/rag/ingest';
await ingestCorpus(db);
```

The script already connects the DB. No new script required — extend the existing one.

---

## 4. Acceptance Criteria

1. `npm run db:seed` completes without error. Each corpus document produces at least 3 chunks in the `chunks` table.
2. All `chunks.embedding` values are non-null after seeding (local model requires no API key).
3. Running `npm run db:seed` twice with an unchanged corpus produces no additional DB rows and makes no embedding API calls on the second run (idempotency).
4. `SELECT COUNT(*) FROM documents;` returns 5 after seeding.
5. All `chunks.embedding` BLOBs have `byteLength` of exactly `384 * 4 = 1536` bytes (384 float32 values for `all-MiniLM-L6-v2`).
6. `npm run typecheck`, `npm run lint`, `npm run test` all pass.
7. `src/lib/db/schema.test.ts` asserts the `documents` and `chunks` tables exist with their expected columns.

---

## 5. Verification Commands

```
npm run db:seed
npm run typecheck
npm run lint
npm run test
```

Manual DB verification (after seed):
```sql
SELECT COUNT(*) FROM documents;
SELECT slug, COUNT(*) as chunks FROM chunks JOIN documents ON chunks.document_id = documents.id GROUP BY slug;
SELECT length(embedding) FROM chunks WHERE embedding IS NOT NULL LIMIT 1;
```

---

## 6. Out-of-Scope

- Vector similarity search / BM25 retrieval (Sprint 5)
- Grounded chat responses (Sprint 5)
- Document upload API or admin UI for corpus management
- Corpus change detection beyond SHA-256 content hash
- Multiple embedding models or model versioning
- Chunk metadata navigation (prev/next chunk IDs, parent chunk IDs)
- Concept keyword extraction
- Conversation chunking (documents only in Sprint 4)
- Re-indexing on model version change

---

## 7. Reference Citations

- Chunking algorithm adapted from `docs/_references/ai_mcp_chat_ordo/src/core/search/MarkdownChunker.ts`
- `transformForEmbedding` function adapted from same file (lines 511–523)
- Ingestion pipeline structure inspired by `docs/_references/ai_mcp_chat_ordo/src/core/search/EmbeddingPipeline.ts`
- Content hash approach from `docs/_references/ai_mcp_chat_ordo/src/core/search/corpus-indexing.ts`
