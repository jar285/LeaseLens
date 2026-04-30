# Sprint QA Report — Sprint 6: AI Eval Harness

**Sprint:** 6  
**Reviewed:** 2026-04-29  
**Reviewer:** Cascade  
**Sprint Plan Version:** In Progress (2026-04-29)

---

## Issues Found

### Issue 1 — Golden case keywords don't exist in corpus (3 of 5 cases)

**Severity:** High  
**Location:** Task 5 — Golden Set Cases

Three golden cases propose `expectedKeywords` that **do not appear anywhere** in the target corpus document:

| Case | Keyword | Target Doc | Exists? |
|------|---------|------------|---------|
| `style-tone` | "approachable" | `style-guide.md` | ❌ Not found |
| `style-tone` | "informal" | `style-guide.md` | ❌ Not found |
| `audience-who` | "gamers" | `audience-profile.md` | ❌ Not found |
| `audience-who` | "tabletop" | `audience-profile.md` | ❌ Not found |
| `audience-who` | "hobbyists" | `audience-profile.md` | ❌ Not found |

These keywords were guessed rather than verified. The groundedness scorer checks for literal keyword presence in retrieved content, so these cases would **always fail** at the ≥ 0.8 threshold.

**Verified correct keywords:**

| Case | Keywords verified in corpus |
|------|---------------------------|
| `brand-voice` | "conversational" ✅, "knowledgeable" ✅, "friend" ✅ (all in `brand-identity.md`) |
| `content-pillars` | "reviews" ✅, "guides" ✅, "news" ✅ (all in `content-pillars.md`) |
| `calendar-schedule` | "weekly" ✅, "schedule" ✅ (in `content-calendar.md`), "publish" ✅ |

**Fix:** Replace bad keywords with words that actually appear in the target docs:
- `style-tone`: use "conversational", "authority", "contractions" (all in `style-guide.md`)
- `audience-who`: use "player", "selective", "community" (all in `audience-profile.md`)

**Status:** ✅ Fixed — Task 5 keywords table updated with corpus-verified words

---

### Issue 2 — Task 4 fallback script uses `require()` in ESM project

**Severity:** Medium  
**Location:** Task 4 — Resolve Golden Set Chunk IDs

The fallback script uses `require('./src/lib/db')` but the project uses `"module": "esnext"` in `tsconfig.json`. Running this with `tsx` would fail because `require()` is not available in ESM context with path aliases.

**Fix:** Replace with a proper `tsx` one-liner using `import`:
```bash
tsx --env-file=.env.local -e "import { db } from './src/lib/db/index.ts'; const rows = db.prepare(\"SELECT id, chunk_level, heading FROM chunks WHERE chunk_level IN ('section','passage') ORDER BY id\").all(); console.table(rows);"
```
Or better: write a small standalone script file.

**Status:** ✅ Fixed — Task 4 fallback replaced with ESM-compatible `scripts/list-chunks.ts` + `tsx --env-file` command

---

### Issue 3 — `scoreGoldenCase` field mapping not documented

**Severity:** Low  
**Location:** Task 2 — scoring.ts

The sprint plan says `scoreGoldenCase` should "extract `chunkId` list and `content` list from `retrievedChunks`" but doesn't document that `RetrievedChunk.chunkId` maps to `retrieved` (for precision/recall/MRR) and `RetrievedChunk.content` maps to `retrievedContent` (for groundedness). This is obvious to the implementer but worth being explicit about since the field names differ between the scoring functions and the `RetrievedChunk` interface.

**Fix:** Add a mapping note to Task 2: "`retrieved` = `chunks.map(c => c.chunkId)`, `retrievedContent` = `chunks.map(c => c.content)`."

**Status:** ✅ Fixed — Explicit field mapping added to `scoreGoldenCase` notes in Task 2

---

### Issue 4 — `overallScorecard.dimensions` aggregation is underspecified

**Severity:** Low  
**Location:** Task 6 — runner.ts

The sprint says `overallScorecard` is built by "flattening all case dimensions" with `totalScore` = sum and `passed` = every case passed. But it doesn't specify what `dimensions` array the overall scorecard should contain — the flattened list of all per-case dimensions (e.g., 20 dimensions for 5 cases × 4 dims each), or a single set of averaged dimensions?

**Fix:** Clarify that `overallScorecard.dimensions` is the **flattened** list of all case dimensions. This matches the Ordo pattern where the scorecard is a simple container and `passed` is the key field.

**Status:** ✅ Fixed — Task 6 now specifies `dimensions` = flat list with example count (5 cases × 4 dims = 20)

---

## Verified — No Issues

| Check | Result |
|-------|--------|
| Spec alignment: all 10 spec files listed in sprint tasks | ✅ All present |
| Task ordering respects dependencies (types → scoring → tests → golden set → runner → reporter → integration tests → CLI → config) | ✅ Correct |
| `createTestDb` exists at `@/lib/db/test-helpers` | ✅ Confirmed |
| `vi.mock('./embed')` pattern matches `retrieve.test.ts` | ✅ Consistent |
| `RetrievedChunk` has `chunkId` and `content` fields | ✅ Confirmed in `retrieve.ts:7-15` |
| `retrieve()` accepts `{ maxResults }` option | ✅ Confirmed in `retrieve.ts:17-22` |
| `package.json` already has `eval:golden` script (needs `--env-file` update) | ✅ Confirmed |
| Commit message follows project convention (`feat(sN):`) | ✅ Matches Sprint 5 |
| Completion checklist matches task list 1:1 | ✅ All 16 items present |
| Test count: 77 existing + 6 scoring + 3 runner = 86 | ✅ Arithmetic correct |
| `brand-voice` keywords verified in corpus | ✅ "conversational", "knowledgeable", "friend" all present |
| `content-pillars` keywords verified in corpus | ✅ "reviews", "guides", "news" all present |
| `calendar-schedule` keywords verified in corpus | ✅ "weekly", "schedule", "publish" all present |

---

## Summary

| Severity | Count |
|----------|-------|
| High | 1 (fixed) |
| Medium | 1 (fixed) |
| Low | 2 (fixed) |

**Recommendation:** All 4 issues have been fixed in the sprint plan. Ready for implementation.
