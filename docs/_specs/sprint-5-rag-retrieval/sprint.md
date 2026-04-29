# Sprint Plan — Sprint 5: Hybrid RAG Retrieval + Grounded Chat

**Sprint:** 5  
**Status:** Complete  
**Date:** 2026-04-29  

---

## Prerequisites

Before any implementation step:
1. Confirm Sprint 4 is fully committed (`git log --oneline -1` should show the Sprint 4 commit).
2. Run `npm run test` — must show 67 passing.
3. Run `npm run db:seed` — must show all 5 docs `unchanged, skipping` (corpus already seeded).

---

## Task List

| # | Task | Files | Type |
|---|------|-------|------|
| 1 | Implement `bm25.ts` — pure BM25 scorer | `src/lib/rag/bm25.ts` | Create |
| 2 | Implement `bm25.test.ts` — 3 unit tests | `src/lib/rag/bm25.test.ts` | Create |
| 3 | Implement `retrieve.ts` — hybrid search pipeline | `src/lib/rag/retrieve.ts` | Create |
| 4 | Implement `retrieve.test.ts` — 5 unit tests | `src/lib/rag/retrieve.test.ts` | Create |
| 5 | Extend `system-prompt.ts` — accept `RetrievedChunk[]` | `src/lib/chat/system-prompt.ts` | Modify |
| 6 | Extend `system-prompt.test.ts` — 2 new tests | `src/lib/chat/system-prompt.test.ts` | Modify |
| 7 | Wire retrieval into chat route | `src/app/api/chat/route.ts` | Modify |
| 8 | Final verification: typecheck, lint, test | — | Verify |

---

## Task 1 — `src/lib/rag/bm25.ts`

**Goal:** Pure BM25 scorer with no imports from the RAG or DB layers.

**Exports:**

```typescript
export interface ChunkRow {
  id:      string;
  content: string;
}

export interface BM25Index {
  avgDocLength:       number;
  docCount:           number;
  docLengths:         Map<string, number>;   // chunkId → word count
  termDocFrequencies: Map<string, number>;   // term → # docs containing term
}

export function tokenize(text: string): string[]
export function buildBM25Index(chunks: ChunkRow[]): BM25Index
export function scoreBM25(
  queryTerms: string[],
  docTokens:  string[],
  docLength:  number,
  index:      BM25Index,
  k1?:        number,  // default 1.2
  b?:         number,  // default 0.75
): number
```

**Implementation notes:**

- `tokenize`: `text.toLowerCase().split(/\W+/).filter(t => t.length >= 2)`
- `buildBM25Index`: iterate chunks once:
  - For each chunk, tokenize content and count `docLength`.
  - Populate `docLengths` map.
  - For each **unique** term in the chunk, increment `termDocFrequencies`.
  - After loop: `avgDocLength = sum(docLengths.values()) / docCount`.
- `scoreBM25`: standard BM25 formula (k1=1.2, b=0.75):
  ```
  for each queryTerm:
    tf  = count of term in docTokens
    idf = log((docCount - termDocFreq + 0.5) / (termDocFreq + 0.5) + 1)
    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLength / avgDocLength))
  ```
  For query terms with `tf === 0`, skip (add 0 to the running sum).

**Zero imports required** — this file is pure TypeScript.

---

## Task 2 — `src/lib/rag/bm25.test.ts`

**3 tests:**

1. **tokenize lowercases and filters short tokens**
   ```typescript
   expect(tokenize('Hello World a')).toEqual(['hello', 'world'])
   ```

2. **buildBM25Index: correct docCount and avgDocLength**
   - Two chunks: `{ id: 'a', content: 'foo bar baz' }`, `{ id: 'b', content: 'foo qux' }`
   - Assert `index.docCount === 2`
   - Assert `index.avgDocLength === 2.5` (avg of 3 and 2 tokens)

3. **scoreBM25: matching chunk scores higher**
   - Build index from two chunks: one containing `'brand voice'`, one containing `'content calendar'`
   - Score both against query terms `['brand']`
   - Assert matching chunk score > non-matching chunk score

---

## Task 3 — `src/lib/rag/retrieve.ts`

**Goal:** Hybrid search function — embed → vector → BM25 → RRF → top-k.

**Full implementation:**

```typescript
import type Database from 'better-sqlite3';
import { embedBatch } from './embed';
import { buildBM25Index, scoreBM25, tokenize } from './bm25';

export interface RetrievedChunk {
  chunkId:      string;
  documentSlug: string;
  heading:      string | null;
  content:      string;
  rrfScore:     number;
  vectorRank:   number | null;
  bm25Rank:     number | null;
}

export interface RetrieveOptions {
  vectorTopN?: number;   // default 20
  bm25TopN?:   number;   // default 20
  rrfK?:       number;   // default 60
  maxResults?: number;   // default 5
}
```

**Algorithm steps (must match spec §5.2 exactly):**

1. Destructure opts with defaults: `vectorTopN=20, bm25TopN=20, rrfK=60, maxResults=5`.

2. Load chunks with JOIN:
   ```sql
   SELECT c.id, c.heading, c.content, c.embedding, d.slug AS document_slug
   FROM chunks c
   JOIN documents d ON d.id = c.document_id
   WHERE c.chunk_level IN ('section', 'passage')
   ```
   If result is empty, return `[]` immediately (empty corpus guard).

3. Embed query:
   ```typescript
   const [rawQuery] = await embedBatch([query]);
   const queryVec = Float32Array.from(rawQuery);
   ```

4. Deserialise stored embeddings:
   ```typescript
   function bufferToFloat32(buf: Buffer): Float32Array {
     const copy = Buffer.alloc(buf.length);
     buf.copy(copy);
     return new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4);
   }
   ```

5. Dot similarity for each chunk, sort descending, slice `vectorTopN`, build `vectorRanking: Map<string, number>` (1-indexed rank):
   ```typescript
   function dotSimilarity(a: Float32Array, b: Float32Array): number {
     let sum = 0;
     for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
     return sum;
   }
   ```

6. Build BM25 index from loaded chunks (pass `{ id, content }` only):
   ```typescript
   const bm25Index = buildBM25Index(rows.map(r => ({ id: r.id, content: r.content })));
   const queryTerms = tokenize(query);
   ```
   Score each chunk, sort descending, slice `bm25TopN`, build `bm25Ranking: Map<string, number>`.

7. RRF fusion (inline — no separate file):
   ```typescript
   function reciprocalRankFusion(rankings: Map<string, number>[], k: number): Map<string, number> {
     const scores = new Map<string, number>();
     for (const ranking of rankings) {
       for (const [id, rank] of ranking) {
         scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
       }
     }
     return scores;
   }
   ```

8. Sort RRF scores descending, slice `maxResults`, map to `RetrievedChunk[]`:
   ```typescript
   return [...rrfScores.entries()]
     .sort((a, b) => b[1] - a[1])
     .slice(0, maxResults)
     .flatMap(([id, rrfScore]) => {
       const row = rowMap.get(id);
       if (!row) return [];
       return [{
         chunkId:      row.id,
         documentSlug: row.document_slug,
         heading:      row.heading,
         content:      row.content,
         rrfScore,
         vectorRank:   vectorRanking.get(id) ?? null,
         bm25Rank:     bm25Ranking.get(id) ?? null,
       }];
     });
   ```

**Invariant check:** `dotSimilarity` is inlined (6 lines); `reciprocalRankFusion` is inlined (8 lines). No extra files created.

---

## Task 4 — `src/lib/rag/retrieve.test.ts`

**5 tests.** All use in-memory SQLite + `vi.mock('./embed')`.

**Setup pattern (same as `ingest.test.ts`):**

```typescript
vi.mock('./embed', () => ({
  embedBatch: vi.fn(async (texts: string[]) =>
    texts.map((text) => {
      const vec = Array.from({ length: 384 }, (_, i) => {
        return ((text.charCodeAt(i % text.length) + i) % 100) / 100;
      });
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      return vec.map((v) => v / norm);
    })
  ),
}));
```

**Helper:** `seedChunk(db, doc, chunkOverrides)` — inserts a document row and chunk row into in-memory DB.

**Tests:**

1. **returns top-k results for a relevant query**
   - Seed chunk with `content: 'alpha beta gamma'` and `chunk_level: 'section'`
   - Query `'alpha beta gamma'` — mock embedding of query === mock embedding of chunk → maximum dot product
   - Assert `results[0].chunkId` matches seeded chunk id

2. **returns empty array when corpus is empty**
   - Empty DB (schema only, no rows)
   - Assert `(await retrieve('any query', db)).length === 0`

3. **respects maxResults option**
   - Seed 6 section chunks across 2 documents
   - Call `retrieve('query', db, { maxResults: 2 })`
   - Assert `results.length === 2`

4. **all returned chunks have rrfScore > 0**
   - Seed 3 section chunks
   - Call `retrieve('alpha', db)`
   - Assert every result has `rrfScore > 0`

5. **document-level chunks are excluded**
   - Seed 1 `document`-level chunk and 2 `section`-level chunks
   - Call `retrieve('query', db)`
   - Assert no result's `chunkId` matches the document-level chunk id

---

## Task 5 — Modify `src/lib/chat/system-prompt.ts`

**Current signature:**
```typescript
export function buildSystemPrompt(role: Role): string
```

**New signature:**
```typescript
import type { RetrievedChunk } from '@/lib/rag/retrieve';

export function buildSystemPrompt(role: Role, context?: RetrievedChunk[]): string
```

**Context block format** (appended when `context` is non-empty):

```
<context>
The following passages are from the Side Quest Syndicate brand documents.
Use them to ground your response. Cite the source heading when relevant.

[1] brand-identity > Brand Voice
"We write like a knowledgeable friend..."

[2] style-guide > Vocabulary Rules
"Avoid 'masterpiece', 'game-changer'..."
</context>
```

**Implementation:**
- If `context` is `undefined` or empty, return existing prompt unchanged.
- Otherwise, build lines array, then append `\n\n<context>\n...\n</context>`.
- For each chunk: truncate `content` to 400 chars with `…` if needed.
- Heading fallback: if `chunk.heading` is null, use `'(no heading)'`.
- Slug display: use `chunk.documentSlug` as-is (already a clean filename without `.md`).

---

## Task 6 — Extend `src/lib/chat/system-prompt.test.ts`

Add 2 tests after the existing 4:

```typescript
import type { RetrievedChunk } from '@/lib/rag/retrieve';

const mockChunks: RetrievedChunk[] = [
  {
    chunkId: 'brand-identity#section:0',
    documentSlug: 'brand-identity',
    heading: 'Brand Voice',
    content: 'We write like a knowledgeable friend.',
    rrfScore: 0.05,
    vectorRank: 1,
    bm25Rank: 1,
  },
];
```

**Test 9:** `includes <context> block when chunks provided`
- `buildSystemPrompt('Creator', mockChunks)`
- Assert result contains `'<context>'`
- Assert result contains `'[1] brand-identity > Brand Voice'`

**Test 10:** `omits <context> block when no chunks provided`
- `buildSystemPrompt('Creator')`
- Assert result does not contain `'<context>'`

---

## Task 7 — Modify `src/app/api/chat/route.ts`

**One addition:** call `retrieve()` after parsing the message and before `buildSystemPrompt`.

**Add import** at top:
```typescript
import { retrieve } from '@/lib/rag/retrieve';
```

**Replace this block** (line ~155–156):
```typescript
const { contextMessages } = buildContextWindow(history);
const systemPrompt = buildSystemPrompt(role);
```

**With:**
```typescript
const { contextMessages } = buildContextWindow(history);

let ragContext: Awaited<ReturnType<typeof retrieve>> = [];
try {
  ragContext = await retrieve(message, db);
} catch (err) {
  console.error('RAG retrieval failed, proceeding without context:', err);
}

const systemPrompt = buildSystemPrompt(role, ragContext);
```

**Why this placement:** `message` is the raw user string — ideal retrieval query before any context-window truncation. Graceful degradation: a retrieval failure never breaks the chat response.

---

## Task 8 — Final Verification

Run in sequence:

```bash
npm run typecheck
npm run lint
npm run test
```

**Expected:**
- typecheck: 0 errors
- lint: 0 errors, 0 fixes applied
- test: **≥ 77 tests passing** (67 existing + 10 new)

**Manual smoke test (optional but recommended):**
1. Start dev server: `npm run dev`
2. Open `http://localhost:3000`
3. Send: `"What is our brand voice?"`
4. Assert: response references "knowledgeable friend" or "conversational authority" or similar language from `brand-identity.md` / `style-guide.md`
5. Send same message again — assert same tone of response (deterministic retrieval)

---

## Completion Checklist

- [x] `src/lib/rag/bm25.ts` created — `tokenize`, `buildBM25Index`, `scoreBM25` exported
- [x] `src/lib/rag/bm25.test.ts` created — 3 tests passing
- [x] `src/lib/rag/retrieve.ts` created — hybrid search with JOIN SQL, `bufferToFloat32`, inline RRF
- [x] `src/lib/rag/retrieve.test.ts` created — 5 tests, mocked embedder, no real WASM
- [x] `src/lib/chat/system-prompt.ts` modified — optional `RetrievedChunk[]` param, `<context>` block
- [x] `src/lib/chat/system-prompt.test.ts` extended — 2 new context tests
- [x] `src/app/api/chat/route.ts` modified — `retrieve()` called, wrapped in try/catch
- [x] `npm run typecheck` — 0 errors
- [x] `npm run lint` — 0 errors
- [x] `npm run test` — 77 passing (67 existing + 10 new)
- [x] Manual smoke test: "What is our brand voice?" returns brand-grounded response with source citations

---

## Commit Strategy

```
feat(s5): hybrid RAG retrieval + grounded chat

- Add bm25.ts: pure tokenize/buildBM25Index/scoreBM25 (k1=1.2, b=0.75)
- Add retrieve.ts: vector + BM25 + RRF hybrid search over chunks table
- Extend system-prompt.ts: inject retrieved passages as <context> XML block
- Wire retrieve() into chat route with graceful degradation on error
- 77 tests passing (10 new: 5 retrieve + 3 bm25 + 2 system-prompt)
- Mark Sprint 5 complete in agent-charter.md
```
