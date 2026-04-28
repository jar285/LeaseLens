# Spec QA — Sprint 4: Seed Corpus + RAG Ingestion Foundation

**Date:** 2026-04-28  
**QA pass by:** Agent self-review  
**Status:** Issues found and fixed before human review

---

## Issues Found

### Issue 1 — Blocking: Wrong Embedding Provider

**Location:** §3.1 (New Dependency), §3.7 (`embed.ts`), §3.3 (BLOB size), §3.2 (env var)

**Problem:** The spec specified `voyageai` (Voyage AI external API) requiring a `VOYAGE_API_KEY`. This conflicts with:
1. The charter's goal of "locally-runnable" without additional API credentials beyond `ANTHROPIC_API_KEY`.
2. The reference project's actual approach: Ordo uses `@huggingface/transformers` with `Xenova/all-MiniLM-L6-v2` — a local WASM model, no API key, free, offline-capable after first model download.
3. Reviewer experience: adding `VOYAGE_API_KEY` means reviewers need a second API account to get embeddings working.

Comparison:
| | Ordo | Spec (original) | Spec (fixed) |
|---|---|---|---|
| Embedder | `@huggingface/transformers` | `voyageai` | `@huggingface/transformers` |
| Model | `Xenova/all-MiniLM-L6-v2` | `voyage-3-lite` | `Xenova/all-MiniLM-L6-v2` |
| Dimensions | 384 | 512 | 384 |
| API key required | No | Yes (`VOYAGE_API_KEY`) | No |
| Works offline | Yes (after first download) | No | Yes |
| Cost | Free | Per-token | Free |

Reference: `docs/_references/ai_mcp_chat_ordo/src/adapters/LocalEmbedder.ts` — lazy-loading singleton using `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')`.

**Fix:** Replace `voyageai` with `@huggingface/transformers`. Remove `VOYAGE_API_KEY` env var. Update dimension references from 512 to 384. Remove key-optional fallback logic (model is always available locally).

**Vercel compatibility note:** Sprint 5 retrieval needs to embed user queries at request time. Node.js serverless functions on Vercel support up to 250MB unzipped — the ~23MB MiniLM model fits. Cold-start model load is ~1–2s on first request; subsequent requests hit the Vercel `/tmp` cache. Acceptable for a demo. This is the same trade-off Ordo accepts.

---

### Issue 2 — Minor: BLOB Size Assertion Uses Wrong Dimensions

**Location:** §4 Acceptance Criterion 5

**Problem:** Criterion stated `512 * 4 = 2048` bytes (Voyage 512-dim). With MiniLM at 384 dims, correct size is `384 * 4 = 1536` bytes.

**Fix:** Updated criterion to `384 * 4 = 1536` bytes.

---

### Issue 3 — Minor: `embed.ts` Signature Included `apiKey` Parameter

**Location:** §3.7 (`embed.ts`)

**Problem:** The proposed signature `embedBatch(texts, apiKey)` and its key-absent fallback (return null vectors) was designed for the Voyage API approach. With a local model, no key is needed and embeddings are always produced. Null embeddings are no longer a valid state.

**Fix:** Simplified contract — `embedBatch(texts: string[]): Promise<number[][]>` with lazy model loading. Removed null-embedding path. Removed BM25-only fallback as a distinct mode (BM25 in Sprint 5 works alongside vector search regardless).

---

## No Other Issues Found

- Schema additions are non-breaking. Existing tables unchanged. ✓
- Idempotency via SHA-256 content hash is sound. ✓
- Corpus file list (5 documents) is consistent with sprint goal. ✓
- Cross-sprint contracts with Sprint 5 (chunk columns needed for retrieval) are all present. ✓
- Chunking rules adapted from Ordo's `MarkdownChunker` are correctly simplified for one source type. ✓
- `db:seed` extension follows existing script structure. ✓
- Out-of-scope list correctly excludes retrieval, BM25, and grounded chat. ✓
- No charter violations. ✓
- Float32Array byte-order is native-endian — consistent across seed and retrieval on the same machine. Acceptable for a local SQLite demo. ✓

---

## Fixes Applied to `spec.md`

All three issues above were corrected in `spec.md` before this QA report was written. The spec is clean for human review.
