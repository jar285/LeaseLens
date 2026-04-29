# Sprint QA — Sprint 5: Hybrid RAG Retrieval + Grounded Chat

**Sprint:** 5  
**Artifact under QA:** `sprint.md`  
**Compared against:** `spec.md`, `agent-charter.md`, `docs/_references/README.md`, current codebase  
**Date:** 2026-04-29  
**Author:** Cascade  

---

## QA Verdict

Three actionable issues found and **all fixed** in `sprint.md` on 2026-04-29. None were blocking.

---

## Issues

### Issue 1 — `scoreBM25` "return 0 immediately" is ambiguous

**Location:** Task 1, line 79 of `sprint.md`

**Problem:** The pseudo-code says:

> Return 0 immediately for any term with `tf === 0`.

This reads as a function-level early return. The correct BM25 behaviour is to **skip the term** (add 0 to the running sum) and continue to the next query term. A multi-term query where only one term matches should still produce a positive score.

**Severity:** Medium — could produce incorrect BM25 scores for multi-term queries if implemented literally.

**Fix:** Reword to: "For query terms with `tf === 0`, skip (add 0 to the running sum)."

**Status:** ✅ Fixed in `sprint.md`

---

### Issue 2 — Dead import in Task 3 skeleton

**Location:** Task 3, line 113 of `sprint.md`

**Problem:** The code skeleton includes:

```typescript
import { createHash } from 'node:crypto';  // not used, but keeping for pattern awareness
```

This is an unused import. `npm run lint` (Biome) will flag it. The comment "keeping for pattern awareness" is not a valid reason under the charter's scope discipline.

**Severity:** Low — will cause lint failure in Task 8.

**Fix:** Remove the line from the Task 3 skeleton.

**Status:** ✅ Fixed in `sprint.md`

---

### Issue 3 — `dotSimilarity` function body missing

**Location:** Task 3, algorithm step 5

**Problem:** The sprint plan specifies all other inline function bodies (`bufferToFloat32`, `reciprocalRankFusion`) but omits the `dotSimilarity` implementation. The spec (§5.2, step 4) references it but also does not include the body.

**Severity:** Low — trivial to derive, but inconsistent with the level of detail provided for every other helper.

**Fix:** Add to Task 3:

```typescript
function dotSimilarity(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}
```

**Status:** ✅ Fixed in `sprint.md`

---

## Verified — No Issues

| Check | Result |
|-------|--------|
| Sprint plan implements all spec goals (G1–G5) | Pass |
| File list matches spec §10 change summary | Pass |
| Module contracts match spec §5.1, §5.2, §5.3 | Pass |
| Test count: 10 new (3 bm25 + 5 retrieve + 2 system-prompt) → ≥ 77 total | Pass |
| Sprint-local invariants from spec §8 are respected | Pass |
| `bm25.ts` has zero imports from RAG/DB layers | Pass |
| `retrieve.ts` takes `db` as parameter, no module-level state | Pass |
| `system-prompt.ts` remains synchronous | Pass |
| Chat route wraps `retrieve()` in try/catch (graceful degradation) | Pass |
| Verification commands match charter §10 | Pass |
| No scope creep beyond spec non-goals (§3) | Pass |
| No `_references/` modifications | Pass |
| `vi.mock` path (`'./embed'`) matches actual module path in `src/lib/rag/` | Pass |
| `avgDocLength` assertion in bm25 test is arithmetically correct (2.5) | Pass |
| `db` import in `route.ts` is the existing module-level singleton, passed as param to `retrieve()` | Pass |

---

## Recommendation

All three issues have been fixed. Sprint plan is ready for implementation.
