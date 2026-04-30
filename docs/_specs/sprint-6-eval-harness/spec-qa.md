# Spec QA Report — Sprint 6: AI Eval Harness

**Sprint:** 6  
**Reviewed:** 2026-04-29  
**Reviewer:** Cascade  
**Spec Version:** Draft (2026-04-29)

---

## Issues Found

### Issue 1 — `eval:golden` script missing `--env-file` flag

**Severity:** High  
**Location:** Section 5.6 / Section 4.2 (package.json)

The existing `eval:golden` script in `package.json` is `tsx scripts/eval-golden.ts`, but the script imports `db` from `@/lib/db`, which imports `env` from `@/lib/env`, which reads `CONTENTOPS_DB_PATH` from environment variables. The `db:seed` script uses `tsx --env-file=.env.local`, but `eval:golden` does **not**.

Without `--env-file=.env.local`, the eval script will fail because `env.CONTENTOPS_DB_PATH` is undefined.

**Fix:** The spec should state that `package.json` must update the `eval:golden` script to `tsx --env-file=.env.local scripts/eval-golden.ts`.

**Status:** ✅ Fixed — Section 4.2 now reads `tsx --env-file=.env.local scripts/eval-golden.ts`

---

### Issue 2 — Golden set chunk IDs are placeholder guesses, not verified

**Severity:** Medium  
**Location:** Section 5.3

The spec shows example chunk IDs like `brand-identity#section:0` and `brand-identity#section:1`. While the spec acknowledges these "will be resolved by querying the seeded database during implementation," the `mergeUndersized()` function in `chunk-document.ts` can merge small chunks into predecessors, which may cause the actual IDs to differ from the naive `#section:N` pattern. Additionally, the passage-level chunks use a separate counter (`passageIndex`), so if a section exceeds 400 words it produces `#passage:N` IDs instead of `#section:N`.

**Fix:** The spec already has the correct disclaimer (line 267), but the example golden set entries in Section 5.3 should be annotated more clearly as **placeholders to be resolved at implementation time** — not treated as authoritative.

**Status:** ✅ Fixed — Example chunk IDs replaced with `<resolve from DB>` placeholders and a bold note added clarifying the mergeUndersized / passage index caveat

---

### Issue 3 — `runner.test.ts` claims "seeded DB" but uses mocked embedder

**Severity:** Medium  
**Location:** Section 8.2

Test #1 says: "`runGoldenEval` with seeded DB passes all cases." But Section 4.1 says `runner.test.ts` uses "in-memory DB and mocked embedder." These are contradictory:

- If the test uses a **mocked embedder**, the retrieval results will differ from the real golden eval (which uses the WASM embedder). The test can't verify that the actual golden set passes.
- If the test uses a **real seeded DB**, it needs the real embedder, making it slow and unsuitable for `npm run test`.

**Fix:** The runner integration tests should use a **simplified golden set** with synthetic chunks and mocked embeddings — they test the runner's orchestration logic (iterate cases → score → build report), not end-to-end retrieval quality. End-to-end is tested by `npm run eval:golden`. Reword test #1 to: "`runGoldenEval` with synthetic golden set and mocked DB produces correct report structure."

**Status:** ✅ Fixed — Test #1 description reworded in Section 8.2 to clarify mocked embedder + synthetic chunks

---

### Issue 4 — `recallAtK` signature ignores `k` in formula

**Severity:** Low  
**Location:** Section 5.2

The function signature is `recallAtK(retrieved, expected, k)` but the formula is `|retrieved ∩ expected| / |expected|`. The `k` parameter is unused in the formula — recall's denominator is always `|expected|`, not `k`. The parameter is only relevant if `retrieved` is already sliced to top-k before being passed in.

**Fix:** Clarify in the spec that `retrieved` is assumed to already be the top-k list (sliced by the runner before calling scoring functions), making `k` redundant in `recallAtK`. Either drop the `k` parameter or document that it's accepted for API consistency with `precisionAtK`.

**Status:** ✅ Fixed — `k` parameter removed from `recallAtK` signature in Section 5.2, with a note that `retrieved` is pre-sliced by the caller

---

### Issue 5 — `writeEvalReport` uses `void` return but performs filesystem I/O

**Severity:** Low  
**Location:** Section 5.5

`writeEvalReport(report: EvalRunReport): void` performs `fs.writeFileSync` to `data/eval-reports/`. It should ensure the directory exists first (`mkdirSync(dir, { recursive: true })`), or the script will throw on first run if `data/eval-reports/` doesn't exist.

**Fix:** Spec should note that `writeEvalReport` must create the output directory if it doesn't exist, same pattern as `db/index.ts` line 8.

**Status:** ✅ Fixed — Section 5.5 now notes `mkdirSync recursive` before writing

---

## Verified — No Issues

| Check | Result |
|-------|--------|
| Charter alignment: Sprint 6 = "AI Eval Harness" | ✅ Matches roadmap line 580 |
| `npm run eval:golden` is already a declared verification command (charter Section 10) | ✅ Confirmed |
| No LLM calls in deterministic layer | ✅ Consistent with non-goals |
| Domain types compatible with Ordo reference | ✅ Simplified but structurally aligned |
| `retrieve()` accepts injected `db` | ✅ Sprint 5 confirmed |
| `package.json` already has `eval:golden` script | ✅ Exists (stub), needs update |
| `.gitignore` needs `data/eval-reports/` | ✅ Not yet present, correctly identified |
| No scope creep beyond charter | ✅ No UI, no SQLite persistence, no live evals |
| Test count arithmetic: 77 + 9 = 86 | ✅ Correct |
| Reporter pattern matches Ordo reference | ✅ `reporting.ts` structure preserved |
| Scoring thresholds are reasonable for 5-doc corpus | ✅ Precision ≥ 0.4, Recall = 1.0, MRR ≥ 0.5, Groundedness ≥ 0.8 |
| `@/*` path alias works with `tsx` | ✅ `tsx` respects `tsconfig.json` paths |

---

## Summary

| Severity | Count |
|----------|-------|
| High | 1 (fixed) |
| Medium | 2 (fixed) |
| Low | 2 (fixed) |

**Recommendation:** All 5 issues have been fixed in the spec. Ready for sprint plan.
