# Sprint 13 — Sprint Plan

**Status:** Draft, awaiting human QA per charter §7 step 4.
**Date:** 2026-05-07.
**Implements:** [`spec.md`](spec.md) (post-QA, all H1–H6 / M1–M11 / L1–L3 fixes applied).
**Charter precondition:** v1.13 amendment landed earlier in this operator session. The amendment, the new `docs/_meta/corpus-sources.md`, and the agent-guidelines `MAX_TOOL_ITERATIONS` rule update are documentation deliverables that ship interleaved with the code per the charter's "docs in the same commit as the code" pattern.

---

## 1. Overview

Sprint 13 ships in **17 phases** across **10 working days**. Phases are dependency-ordered: rename → schema → helpers → parsing → corpus → tools → registry → upload → UI components → page rebuild → evals → cockpit → cleanup → smoke → deploy → docs. Each phase has a TDD step (red → green → refactor) and is independently verifiable. The operator may approve at phase boundaries.

| Day | Phase | Subject | TDD step | Est. |
|---|---|---|---|---|
| 1 | 0 | Pre-flight + Context7 verification of `pdfjs-dist` and `react-pdf` | n/a | 30 min |
| 1 | 1 | Codebase rename (env-var prefix, package name, MCP server file, DB path) — atomic | RED via test env-var probes | 90 min |
| 1–2 | 2 | Schema additions (`leases`, `clauses`, `negotiation_emails`, `conversations.active_lease_id`) | RED → GREEN → REFACTOR | 90 min |
| 2 | 3 | Helpers: `role-labels`, `disclaimer`, `resolve-lease-id`, `assert-lease-ownership` | RED → GREEN | 90 min |
| 3 | 4 | PDF parsing pipeline: `parse-pdf`, `segment-clauses`, `classify-clause`, `validate-upload`, `queries` | RED → GREEN → REFACTOR | 4 hr |
| 4 | 5 | NJ tenant-law seed corpus + sample lease + `corpus-sources.md` log + `db:seed` update | docs+seed | 6 hr |
| 5 | 6 | Lease tools: `extract_clauses`, `grade_clause_severity`, `draft_negotiation_email` | RED → GREEN → REFACTOR | 4 hr |
| 5 | 7 | Tool registry rewire, system prompt, MCP server rename | RED → GREEN | 90 min |
| 6 | 8 | Lease upload route (`POST /api/leases`) + GET route | RED → GREEN → REFACTOR | 3 hr |
| 6–7 | 9 | UI primitives: `PdfViewer`, `RedFlagReport`, `CitationChip`, `LeaseScanCTA`, `LeaseUploadDropzone`, `ChatStreamContext` | RED → GREEN → REFACTOR | 6 hr |
| 7 | 10 | Three-pane page rebuild + `ChatUI` rewire + role-label conformance | RED → GREEN | 3 hr |
| 8 | 11 | Eval harness: Tier 1 (replace `golden-set`), Tier 2 (`lease-grading-runner` + `lease-cases`) | RED → GREEN | 4 hr |
| 8 | 12 | Cockpit `EvalHealthPanel` two-tier display + chat-route MAX bump test | RED → GREEN | 90 min |
| 9 | 13 | Delete `mutating-tools.ts` + old Side Quest corpus + ContentOps tool fixtures; e2e-mock rewrite | n/a | 90 min |
| 9 | 14 | Manual smoke against acceptance criteria 1–13 (local) | manual | 2 hr |
| 10 | 15 | Vercel deploy + env-var rename on dashboard + AC 14–15 smoke | manual + ops | 3 hr |
| 10 | 16 | README rewrite + Loom recording + architecture doc refresh + impl-qa.md | docs | 4 hr |

**Total estimate:** ~50 hours focused work over ~10 working days. Phase boundaries are real commit candidates; the operator commits at their own cadence.

**Phase dependency notes.**
- Phase 4 reads `LEASELENS_LEASE_MAX_*` env vars added in Phase 1; Phase 1 must complete before Phase 4 begins. The day-band already orders this correctly (Phase 1 = Day 1; Phase 4 = Day 3).
- Phase 6 (lease tools) imports helpers from Phase 3 + queries from Phase 4 + corpus from Phase 5; do not start Phase 6 before Phases 3-5 are green.
- Phase 9 (UI primitives) imports from Phase 8 (route handlers); start Phase 9 only after Phase 8 has at least task 1 (POST route) green.
- Phase 11 (Tier 1 eval rewrite) requires Phase 5's seeded corpus chunk IDs to exist in the dev DB. Re-seed before running `eval:golden`.

**Test count target.** Current: 317 (post-Sprint 12). Target: **375 ± 10** (net ~+58, conservatively). Per-phase deltas below sum to approximately +110 nominally, but many "new" tests in Phases 4 and 9 replace consolidated cases rather than purely adding; the conservative net of +58 absorbs that. Removed: 7 tests (mutating-tools + ContentOps tool fixtures, Phase 13). The ±10 band absorbs natural variance.

---

## 2. Pre-flight (Phase 0)

Run on a clean working tree, **before** any code change:

```
git status                       # must be clean (per operator's commit discipline)
npm run typecheck
npm run lint
npx vitest run
npm run eval:golden              # baseline before corpus swap
```

All four must be green. The eval baseline is captured into a JSON file (`data/eval-reports/baseline-pre-sprint-13.json`) and committed as part of Phase 0 — it is the regression target for the corpus swap in Phase 5.

**Library API verification (charter §15a).** Run Context7 lookups for the two new dependencies BEFORE Phase 4 / Phase 9 begin. Record the resolved API signatures in this sprint plan as a Phase 0 sub-step, in the table below. Do not skip — Sprint 12 verified `mermaid` and `motion`; the same discipline applies here.

| Library | Lookup | Verified version | API points to confirm |
|---|---|---|---|
| `pdfjs-dist` | `/mozilla/pdfjs-dist` (or equivalent) | `<filled at Phase 0>` | `getDocument()`, `pdf.getPage()`, `page.getTextContent()`, ESM vs legacy build for Node |
| `react-pdf` | `/wojtekmaj/react-pdf` (or equivalent) | `<filled at Phase 0>` | `<Document>`, `<Page>`, `pageRef` / `onLoadSuccess`, worker setup |

If Context7 returns unexpected signatures, the relevant phase pauses to update the spec/sprint plan rather than fabricating syntax.

**Context7 fallback (per sprint-qa M3).** If Context7 is unavailable in the implementation session, capture versions via `npm ls pdfjs-dist` and `npm ls react-pdf` post-install; confirm API points by reading each package's published `.d.ts` files (both libraries ship types). This is a weaker grounding than Context7 but still beats relying on training-data memory. Do **not** skip the verification step — at minimum, the resolved `.d.ts` reads must be reflected in this sprint plan's table before Phase 4 begins.

**Lint count baseline.** Current `npm run lint` is expected to surface ~140 CRLF↔LF complaints (pre-existing per charter v1.10). The count must not increase across this sprint. Capture the exact pre-sprint count at Phase 0 and assert it at every phase boundary.

---

## 3. Phase 1 — Codebase rename (atomic)

**Goal.** Rename every project-name-bearing identifier in one phase so that intermediate commits do not leave the codebase half-renamed. Per spec §2.11 this is an invariant.

**Tasks.**

1. **`package.json`** — `name` `"contentop"` → `"leaselens"`. Update `scripts.mcp:server` target to `tsx mcp/leaselens-server.ts`.
2. **`mcp/contentops-server.ts` → `mcp/leaselens-server.ts`** (file rename) and the matching test file. Internal references inside the file (e.g., binary name in MCP server registration) update from `contentops` to `leaselens`.
3. **`src/lib/env.ts`** — every env-var prefix `CONTENTOPS_*` → `LEASELENS_*`. Add the two new vars from spec §3j: `LEASELENS_LEASE_MAX_BYTES` (default 1048576, min 102400, max 5242880), `LEASELENS_LEASE_MAX_PAGES` (default 30, min 1, max 100).
4. **`src/lib/db/index.ts`** — DB path env var read updates to `LEASELENS_DB_PATH`. Default `./data/leaselens.db`.
5. **`src/lib/db/rate-limit.ts`, `src/lib/db/spend.ts`, `src/lib/db/migrate.ts`** — search for `CONTENTOPS_` and replace prefix.
6. **`src/lib/anthropic/client.ts`** — env-var rename (`CONTENTOPS_E2E_MOCK` → `LEASELENS_E2E_MOCK`, etc.).
7. **`src/lib/anthropic/e2e-mock.ts`** — same.
8. **`src/app/api/chat/route.ts`** — env-var reads + the `SPEND_CEILING_MESSAGE` constant updates GitHub URL to `github.com/jar285/leaselens` (sprint-plan-decides item; operator confirms repo name before the Phase-15 deploy).
9. **`src/middleware.ts` + `src/lib/auth/session.ts` + `src/lib/workspaces/cookie.ts`** — cookie name constants. Today: `contentops_session` (session) and the workspace cookie name (defined in `cookie.ts` as `WORKSPACE_COOKIE_NAME`). Per spec §2.11 these rename to `leaselens_session` and `leaselens_workspace`. Existing visitors lose their cookie on first load post-deploy; acceptable for a portfolio demo. The grep audit at the end of Phase 1 covers any miss.
10. **`playwright.config.ts`** — `webServer.env.CONTENTOPS_E2E_MOCK` → `LEASELENS_E2E_MOCK`.
11. **`tests/e2e/*.spec.ts`** — env-var references.
12. **`scripts/eval-golden.ts`, `scripts/diag-db.mjs`, `src/db/seed.ts`** — env-var references.
13. **`.env.local.example`** — every variable renamed to the new prefix. Add the two new vars from step 3.
14. **`README.md`** — temporary placeholder until Phase 16 rewrites it; at minimum, update the project name in the title.

**Verification.**

```
npm run typecheck    # must be green; the env-var rename is the noisiest source of breakage
npm run lint
npx vitest run
```

Tests that hardcoded the prefix `CONTENTOPS_` need updating in the same commit. A grep is the audit tool:

```
grep -rn "CONTENTOPS_" src/ mcp/ scripts/ tests/ docs/_specs/sprint-13-leaselens/
# expected zero hits after this phase
grep -rn "contentops_" src/ mcp/ scripts/ tests/
# expected zero hits except in commit history / changelog references
grep -rn "contentops" docs/_meta/agent-charter.md docs/_meta/agent-guidelines.md docs/_meta/architecture.md
# expected matches in historical sprint descriptions only — those stay (charter v1.13 §16 explicitly preserves them)
```

**Test count delta:** 0 (rename only).

---

## 4. Phase 2 — Schema additions

**Goal.** Add three new tables and one column. Idempotent migrations via the existing `migrate.ts` pattern.

**Tasks.**

1. **`src/lib/db/schema.ts`** — append three CREATE TABLE statements per spec §3e and the two indexes per table that have one. The schema constant order matters for boot-time `db.exec(SCHEMA)`: leases must come before clauses (FK), clauses before negotiation_emails (FK).
2. **`src/lib/db/schema.test.ts`** — extend the existing fresh-schema invariant assertions: assert all three new tables exist, assert FK declarations resolve, assert per-table indexes exist.
3. **`src/lib/db/migrate.ts`** — add idempotent migration block:
   - Check if `conversations.active_lease_id` column exists via `PRAGMA table_info(conversations)`; if not, `ALTER TABLE conversations ADD COLUMN active_lease_id TEXT`.
   - The three new tables are picked up by `db.exec(SCHEMA)` on a fresh DB; on an existing DB they're idempotent because `CREATE TABLE IF NOT EXISTS` is the schema's pattern. Confirm in test.
4. **`src/lib/db/migrate.test.ts`** — extend with: dev-DB upgrade path (existing pre-S13 schema → run migrate → assert all new tables and column present), and a re-run idempotency assertion.
5. **`src/lib/workspaces/cleanup.ts`** — extend `purgeExpiredWorkspaces` cascade per spec §3e (children-first order: `negotiation_emails → clauses → leases → chunks → audit_log → content_calendar → approvals → documents → messages → conversations → workspaces`). Wrap the entire cascade in one `db.transaction()`.
6. **`src/lib/workspaces/cleanup.test.ts`** — extend with: cascade order assertion; FK-constraint-not-violated assertion; rows-deleted-count for each table.

**Verification.**

```
npx vitest run src/lib/db
npx vitest run src/lib/workspaces/cleanup
```

**Test count delta:** +6 (schema +2, migrate +2, cleanup +2).

---

## 5. Phase 3 — Helpers

**Goal.** Land the four small helpers that downstream tools and routes will import. All pure functions, easy to test, no DB dependencies except where noted.

**Tasks.**

1. **`src/lib/auth/role-labels.ts`** — `ROLE_LABELS` map and `labelFor(role)` per spec §3g. Pure function, no imports beyond the `Role` type.
2. **`src/lib/auth/role-labels.test.ts`** — three positive cases + one exhaustiveness check (TS will catch missing roles, but the test still asserts each map entry).
3. **`src/lib/lease/disclaimer.ts`** — exports a single string constant `LEASELENS_DISCLAIMER`. Operator confirms wording (sprint-plan-decides §11.10 in spec); default below, edited if operator pushes back:
   > "LeaseLens reviews leases against NJ tenant-law sources but is not a lawyer and does not provide legal advice. Before acting on any clause grading, consult a tenant attorney or your local NJ legal-aid clinic."
4. **`src/lib/lease/resolve-lease-id.ts`** — implementation per spec §3h "lease-id resolution helper." Three-step resolution. Throws with a message naming both ways to provide the id.
5. **`src/lib/lease/resolve-lease-id.test.ts`** — six cases: explicit input; conversation fallback; explicit wins over conversation; workspace mismatch on input throws; workspace mismatch on conversation row throws; both missing throws.
6. **`src/lib/lease/assert-lease-ownership.ts`** — per spec §2.12. Signature: `assertLeaseOwnership(lease, ctx)`. Logic: if `ctx.role === 'Creator'` (Tenant) and `lease.uploaded_by !== ctx.userId`, throw with a clear message. Reviewer/Admin returns silently.
7. **`src/lib/lease/assert-lease-ownership.test.ts`** — six cases across the three roles × owns/doesn't own.

**Verification.**

```
npx vitest run src/lib/auth/role-labels
npx vitest run src/lib/lease/resolve-lease-id
npx vitest run src/lib/lease/assert-lease-ownership
```

**Test count delta:** +13 (4 + 6 + 6 minus a couple of consolidated cases).

---

## 6. Phase 4 — PDF parsing pipeline

**Goal.** Server-side PDF text extraction + clause segmentation + clause classification + multipart upload validation + lease/clause queries. The hardest non-LLM phase — `pdfjs-dist` Node setup is the spec §8 risk.

**Tasks.**

1. **Confirm `pdfjs-dist` Node-side import path via Context7.** Phase 0 should have done this; if not, do it now. The spec §8 risk: legacy build vs ESM build. Document the resolved import in a one-line code comment in `parse-pdf.ts`.
2. **`src/lib/lease/parse-pdf.ts`** — exports `MIN_PAGE_TEXT_CHARS = 30` constant, `parsePdf(buffer: Uint8Array): Promise<{ pageCount: number; pages: { pageNumber: number; text: string }[] }>`. Throws on a parse error; the upload route catches and surfaces 422.
3. **`src/lib/lease/parse-pdf.test.ts`** — fixture-based: a small known-good PDF (committed to `src/lib/lease/__fixtures__/`), a tiny PDF with no text layer (committed), a malformed PDF (committed). Three cases.
4. **`src/lib/lease/segment-clauses.ts`** — pure function `segmentClauses(pages)` returning the array per spec §3c step 2. Handles partial-text-layer (some pages empty), zero-clause (empty result is valid).
5. **`src/lib/lease/segment-clauses.test.ts`** — five cases: clean numbered sections; mixed-prefix sections (`1.`, `(a)`, `ARTICLE I`); all-empty pages; one populated + rest empty; pages where text doesn't match any prefix (zero-clause valid path).
6. **`src/lib/lease/classify-clause.ts`** — pure function `classifyClause(text: string): ClauseType` over the 13 types per spec §3c. Keyword sets are exported constants for testability.
7. **`src/lib/lease/classify-clause.test.ts`** — 14 cases (13 types × planted samples + 1 unknown).
8. **`src/lib/lease/validate-upload.ts`** — pure function `validateLeaseUpload(file: File): { ok: true, file } | { ok: false, error }`. Reads `LEASELENS_LEASE_MAX_BYTES` and `LEASELENS_LEASE_MAX_PAGES`. The page count is unknown at validate time; the function checks size + content-type only. Page count is enforced after `parsePdf` returns and is its own error path.
9. **`src/lib/lease/validate-upload.test.ts`** — five cases: happy, oversized, wrong content-type, missing file, exactly-at-limit.
10. **`src/lib/lease/queries.ts`** — `insertLease`, `insertClause`, `getLease(id, workspaceId)`, `listClauses(leaseId, workspaceId)`, `getActiveLease(conversationId)`, `setActiveLease(conversationId, leaseId)`. Workspace-scoped per spec §2.2 + §2.12. All synchronous (better-sqlite3).
11. **`src/lib/lease/queries.test.ts`** — happy paths + workspace-isolation assertion + tenant-ownership assertion at the query level.

**Verification.**

```
npx vitest run src/lib/lease
```

**Test count delta:** +28 (3 parse + 5 segment + 14 classify + 5 validate + ~10 queries minus consolidations).

---

## 7. Phase 5 — NJ tenant-law seed corpus + sample lease

**Goal.** Curate the corpus, ship a sample lease, populate the provenance log, rename the sample workspace, update the seed script.

**Tasks.**

0. **`src/lib/workspaces/constants.ts`** — rename `SAMPLE_WORKSPACE.name` from "Side Quest Syndicate" to "LeaseLens — NJ Tenant Law" (or operator's preferred wording). Update `description` to match. The id is unchanged (its UUID is referenced from the eval golden set; changing it would invalidate baseline JSONs). Update the matching test file in the same task.
1. **Curate ~40-60 markdown files** at `src/corpus/nj-tenant-law/` covering the 13 issue families per spec §3d. Each file is one logical section, pulled verbatim from the NJ.gov source (Truth-in-Renting Act PDF, NJ Stat 46:8, NJ Stat 2A:18). Plain-language paraphrases (NOLO) are flagged in the Notes column of `corpus-sources.md`. **This is the longest phase by wall-clock.** Allocate a full day.

   **Minimum-viable fallback** if curation runs out of time: ship at least 25 sections covering the top 8 issue families (security deposit, late fee, early termination, sublet, repair/habitability, entry, retaliation, automatic renewal). The 5 lower-priority families can land in a follow-up sprint. The Tier 1 eval at task 8 catches the gap.
2. **Append rows to `docs/_meta/corpus-sources.md`** — one row per corpus file. Columns per the placeholder header: filename, authority, URL, accessed (today), notes.
3. **Delete `src/corpus/*.md`** — the existing Side Quest Syndicate files. Use `git rm` so the deletion is tracked.
4. **Hand-craft the sample lease** at `src/corpus/sample-lease/sample-nj-residential-lease.pdf`. 12-15 numbered clauses spanning the 13 issue families, with a few intentional planted issues (over-cap late fee, illegal early-termination, etc.) so the demo's grading produces visible red flags. The PDF is generated from a markdown source in the same directory using a one-shot `pandoc` or similar; the source markdown is committed alongside the PDF.
5. **`src/db/seed.ts`** — replace the Side-Quest-Syndicate ingest path with: ingest NJ corpus into the sample workspace, then insert the sample lease into the new `leases` and `clauses` tables. Use the new `parsePdf` + `segmentClauses` + `classifyClause` pipeline. The sample lease's `id` is a stable UUID committed in the seed script (the lease-grading eval references it).
6. **`src/db/seed.test.ts`** — assert: corpus files all ingest, chunk count is in expected range, sample lease has expected `clause_count`, the planted issues are present in the segmented clauses.
7. **Run `npm run db:seed` against a fresh DB** and inspect via `scripts/diag-db.mjs`. Capture the row counts in this phase's commit message.
8. **Re-run `npm run eval:golden`** — this WILL regress because the golden cases still target Side Quest Syndicate. The regression is expected; Phase 11 fixes it. Record the regressed score in this phase's commit message as the deliberate intermediate state.

**Verification.**

```
npm run db:seed                              # populates fresh dev DB
node scripts/diag-db.mjs                     # row counts + FK probes
npx vitest run src/db/seed
```

**Test count delta:** +1 (seed.test.ts; existing assertions are reframed for new content).

---

## 8. Phase 6 — Lease tools

**Goal.** Three new tool descriptors per spec §3b.

**Tasks.**

1. **`src/lib/tools/domain.ts`** — `ToolCategory` adds `'lease'`.
2. **`src/lib/tools/lease-tools.ts`** — three exported factories:
   - `createExtractClausesTool(db: Database)` — read-only, roles `'ALL'`. Calls `resolveLeaseId(input, ctx)` then `assertLeaseOwnership(lease, ctx)` then `listClauses`. Result envelope per spec §3b.
   - `createGradeClauseSeverityTool(db: Database, anthropic: AnthropicClient)` — read-only, roles `'ALL'`. Loads the clause, runs `retrieve(clause.text, db, ctx)` to get top-3 NJ tenant-law chunks, calls `anthropic.messages.create` (non-streaming) with a structured-output prompt asking for `{severity, statute_citation, chunk_id, reasoning, recommended_action}`, validates `chunk_id` is in the retrieved set AND `statute_citation` substring matches the cited chunk's text per spec §2.6, returns the result. Throws on validation failure.
   - `createDraftNegotiationEmailTool(db: Database, anthropic: AnthropicClient)` — mutating, roles `['Creator', 'Editor', 'Admin']`. Calls `assertLeaseOwnership` (Tenant case enforced; Reviewer/Admin pass through), generates email body via `anthropic.messages.create`, INSERTs into `negotiation_emails`. Returns `MutationOutcome` with `compensatingActionPayload: { email_id }`. `compensatingAction` is `DELETE FROM negotiation_emails WHERE id = ?`.
3. **`src/lib/tools/lease-tools.test.ts`** — 12 cases:
   - extract: happy, ownership-fail (Tenant trying other tenant's lease), workspace-fail.
   - grade: happy, citation-not-in-corpus throws, statute-substring-not-in-chunk throws, retrieval-empty throws.
   - draft: happy + audit row, ownership-fail, rollback round-trip (compensating action deletes the row).
4. **`src/lib/tools/lease-tools.integration.test.ts`** — full chat-route integration scenario for each tool. Uses `e2e-mock` to drive the LLM-tool branch.

**Verification.**

```
npx vitest run src/lib/tools/lease-tools
```

**Test count delta:** +12 unit + 3 integration = 15.

---

## 9. Phase 7 — Tool registry rewire + system prompt + MCP server

**Goal.** Wire the new tools into the registry, drop the removed tools, rewrite the system prompt, rename the MCP server.

**Tasks.**

1. **`src/lib/tools/create-registry.ts`** — register `createExtractClausesTool`, `createGradeClauseSeverityTool`, `createDraftNegotiationEmailTool`. Remove `createScheduleContentItemTool` and `createApproveDraftTool`. Update `corpus-tools.ts` descriptions for the NJ tenant-law context (in-place; no API change).
2. **`src/lib/tools/create-registry.test.ts`** — assert seven tools registered (4 retained + 3 new), assert two tools removed, assert RBAC filtering returns the expected set per role.
3. **`src/lib/chat/system-prompt.ts`** — full prose replacement per spec §3h. Add `activeLease` parameter to `buildSystemPrompt`'s opts. Add the eight numbered sections.
4. **`src/lib/chat/system-prompt.test.ts`** — assertions per spec §3h end paragraph: identity sentence, disclaimer presence, tool manifest exact match, role-label conformance, active-lease branch (with and without).
5. **`mcp/leaselens-server.ts`** (renamed in Phase 1) — register the three new tools, drop the two removed. Hardcoded sample workspace + Admin role unchanged from Sprint 12 pattern. Sprint plan note: when the LLM client is Claude Desktop, the `lease_id` MUST be passed explicitly per spec H5; no conversation context exists in MCP.
6. **`mcp/leaselens-server.test.ts`** — assert seven tools exposed over MCP; assert `extract_clauses` requires explicit `lease_id` when `conversationId` is the synthetic MCP value.

**Verification.**

```
npx vitest run src/lib/tools/create-registry src/lib/chat/system-prompt mcp/
```

**Test count delta:** +6 (registry +2, prompt +3, MCP +1; existing prompt tests update in place).

---

## 10. Phase 8 — Lease upload route

**Goal.** `POST /api/leases` and `GET /api/leases/[id]`.

**Tasks.**

1. **`src/app/api/leases/route.ts`** (POST) — multipart `file` field. Calls `validateLeaseUpload` → `parsePdf` → page-count check → `segmentClauses` → `classifyClause` per clause → `db.transaction` writing `leases` and `clauses` → `setActiveLease` → returns `{ lease_id, page_count, clause_count }`. Demo guardrails: rate-limit + spend-ceiling (existing helpers). Also calls `purgeExpiredWorkspaces` per spec §3c lazy cleanup.
2. **`src/app/api/leases/route.integration.test.ts`** — six cases: happy + 422 no-text-layer + 413 oversize + 415 wrong content-type + 429 rate-limit + ownership write check (Tenant uploads attach `uploaded_by = ctx.userId`).
3. **`src/app/api/leases/[id]/route.ts`** (GET) — returns `{ lease, clauses }`. Calls `assertLeaseOwnership` per spec §2.12.
4. **`src/app/api/leases/[id]/route.integration.test.ts`** — three cases: happy, ownership-fail (Tenant), workspace-fail.

**Verification.**

```
npx vitest run src/app/api/leases
npm run typecheck
```

**Test count delta:** +9.

---

## 11. Phase 9 — UI primitives

**Goal.** All client-component primitives that the three-pane page assembles. Each component is independently testable.

**Tasks.**

1. **`src/components/lease/PdfViewer.tsx`** — `'use client'`, dynamic-imports `react-pdf` to keep `pdfjs-dist` out of the SSR bundle. Renders pages, exposes `scrollToPage(n)` via `useImperativeHandle`. Accepts `pdfUrl: string` (a temp blob URL or a server-served path).
2. **`src/components/lease/PdfViewer.test.tsx`** — three cases: renders skeleton on first paint (mounted-state guard, mirrors Sprint-12 `MermaidDiagram` pattern), renders pages after load, scroll-to-page imperative call.
3. **`src/components/lease/CitationChip.tsx`** — presentation-only `<button>` per spec §3f. Click handler is wired by the parent.
4. **`src/components/lease/CitationChip.test.tsx`** — three cases: renders with statute label, click invokes prop, accessible label.
5. **`src/components/lease/RedFlagReport.tsx`** — `'use client'`, `useContext(ChatStreamContext)`, filters `toolEvents` by tool name, renders `<RedFlagCard>` per grading result. Citation chip click forwards via context.
6. **`src/components/lease/RedFlagReport.test.tsx`** — five cases: empty state, single grading renders, multiple gradings sort by severity, citation-chip click calls `pdfViewerRef.current.scrollToPage`, error state for a tool error pill.
7. **`src/components/lease/LeaseScanCTA.tsx`** — empty-state replacement when `active_lease_id` is set and conversation is empty. Posts the synthetic user message on click.
8. **`src/components/lease/LeaseScanCTA.test.tsx`** — three cases: renders when conversation empty + active lease set; click triggers post; doesn't render when messages exist.
9. **`src/components/lease/LeaseUploadDropzone.tsx`** — drag-and-drop + click-to-pick, calls `POST /api/leases`. Shows progress, error states, success state with the new lease's clause count.
10. **`src/components/lease/LeaseUploadDropzone.test.tsx`** — six cases: drag-enter/leave, drop-with-pdf, click-to-choose, oversized-file error, server-error, success state.
11. **`src/components/chat/ChatStreamContext.tsx`** — exports `<ChatStreamProvider>` and `useChatStream`. Provider state: `toolEvents: ToolEvent[]`, `pdfViewerRef: RefObject<PdfViewerHandle>`. Consumer hook returns the same.
12. **`src/components/chat/ChatStreamContext.test.tsx`** — three cases: provider mounts, consumer reads events, ref forwarding works.

**Verification.**

```
npx vitest run src/components/lease src/components/chat/ChatStreamContext
```

**Test count delta:** +26.

---

## 12. Phase 10 — Three-pane page rebuild

**Goal.** Wire the primitives into `src/app/page.tsx`. Update `ChatUI` to push tool events into `ChatStreamContext`. Update role labels everywhere.

**Tasks.**

1. **`src/app/page.tsx`** — server component. Resolves session + workspace + active lease + conversation. Passes serialized payload into a client wrapper that mounts `<ChatStreamProvider>`, then the three panes. Three-column flex layout with the PDF viewer left, ChatUI middle, RedFlagReport right. Below 1024px the panes flex-wrap (per spec §3f, incidental).
2. **`src/app/page.test.tsx`** — assert: server resolution path, three-pane structure, role-label-aware header.
3. **`src/components/chat/ChatUI.tsx`** — extend the NDJSON parse loop: on `tool_use` and `tool_result` events, push to `useChatStream().pushToolEvent(...)` in addition to existing message-state updates. Also: when `active_lease_id` is set and `messages.length === 0`, render `<LeaseScanCTA>` instead of `ChatEmptyState`.
4. **`src/components/chat/ChatUI.test.tsx`** — extend with: tool events forwarded to context, `LeaseScanCTA` branch.
5. **`src/components/chat/ChatEmptyState.tsx`** — copy rewritten for LeaseLens. Uses `labelFor(role)` for role display.
6. **`src/components/auth/RoleSwitcher.tsx`** — uses `labelFor(role)`. Three roles same as before; the displayed labels change.
7. **`src/components/cockpit/*.tsx`** — search for hardcoded "Creator/Editor/Admin" UI strings; replace with `labelFor(role)`. Cockpit headers update.
8. **`src/components/layout/WorkspaceMenu.tsx`** — workspace name updates per the renamed sample workspace.

**Verification.**

```
npx vitest run src/app src/components/chat src/components/auth src/components/cockpit src/components/layout
npm run dev    # manual: navigate to /, confirm three panes load with empty states
```

**Test count delta:** +4 (existing UI tests update in place; net new is small here because most tests already exist for the affected components).

---

## 12.5. Post-Phase-10 hotfix series (UX hardening, not in original plan)

This section is a journal of the hotfixes that ran after Phase 10's three-pane shell landed and before the planned Phase 11 (eval harness). They are sequenced 10A–10H (PDF rendering correctness), 10.5–10.8 (UX polish), and 10.8.1–10.8.3 (chat surface bugs). All fixes shipped with TDD; gates stayed green throughout (typecheck · lint baseline · vitest 491/491 with the 3 known cross-file DB-isolation flakes that pass in isolation).

### Phase 10 hotfix series — PDF render correctness

| | What broke | Fix | Files |
|---|---|---|---|
| **10A** | `DOMMatrix is not defined` on SSR — react-pdf evaluates at module init | Split `PdfViewer` into a thin wrapper using `next/dynamic({ ssr: false })` + a `.client.tsx` implementation | [`PdfViewer.tsx`](../../../src/components/lease/PdfViewer.tsx), [`PdfViewer.client.tsx`](../../../src/components/lease/PdfViewer.client.tsx) |
| **10B** | `POST /api/leases 422` "Cannot find module pdf.worker.mjs" server-side | Added `pdfjs-dist` to `serverExternalPackages` in [`next.config.ts`](../../../next.config.ts) so Turbopack stops mangling its relative worker path |
| **10C** | Empty-state copy still showed ContentOps-era "Side Quest Syndicate" cards | Rebranded all 4 empty-state cards + composer placeholder | [`ChatEmptyState.tsx`](../../../src/components/chat/ChatEmptyState.tsx), [`ChatComposer.tsx`](../../../src/components/chat/ChatComposer.tsx) |
| **10D** | `Uncaught TypeError: URL.parse is not a function` from pdfjs-dist v5 | Polyfill `URL.parse` BEFORE react-pdf import (ES module source-order semantics) | [`url-parse-polyfill.ts`](../../../src/components/lease/url-parse-polyfill.ts) |
| **10E** | PDF stuck on "Loading PDF…" forever — Turbopack didn't reliably emit the worker via `new URL(...)` | Serve `pdf.worker.min.mjs` as a static asset from `/public`; postinstall + predev + prebuild script keeps it in sync | [`scripts/copy-pdf-worker.mjs`](../../../scripts/copy-pdf-worker.mjs), [`PdfViewer.client.tsx`](../../../src/components/lease/PdfViewer.client.tsx) |
| **10F** | New conversation + recent upload → `extract_clauses` errors with "no lease specified" because conversation wasn't bound at upload time | Added opt-in `enableRecentLeaseFallback` to `resolveLeaseId` (workspace-scoped, user-scoped, 30-min window). Promotes the binding by writing `active_lease_id`. MCP path keeps it off per spec H5 | [`resolve-lease-id.ts`](../../../src/lib/lease/resolve-lease-id.ts), [`lease-tools.ts`](../../../src/lib/tools/lease-tools.ts) |
| **10G** | Worker threw `Promise.try is not a function` (Chrome 128+ / Safari 18.2+ feature) | Switch to **legacy** pdfjs-dist worker build (transpiled with broader compat targets) | [`scripts/copy-pdf-worker.mjs`](../../../scripts/copy-pdf-worker.mjs) |
| **10H** | API/Worker version mismatch — react-pdf v10 pins `pdfjs-dist: 5.4.296` exactly, our top-level was newer | Source the worker from react-pdf's **nested** `node_modules/react-pdf/node_modules/pdfjs-dist`, not the top-level | [`scripts/copy-pdf-worker.mjs`](../../../scripts/copy-pdf-worker.mjs) |

### Phase 10.5 — UI/UX polish (dropzone redesign + viewer chrome + scroll architecture)

- [`LeaseUploadDropzone.tsx`](../../../src/components/lease/LeaseUploadDropzone.tsx) full redesign with explicit `data-status="idle|dragover|uploading|success|error"`, Lucide icons, soft per-state accent colors, drag-depth tracking (Ordo pattern). Better empty-state copy + size-limit hint.
- [`PdfViewer.client.tsx`](../../../src/components/lease/PdfViewer.client.tsx) gained a header chrome (filename + page/clause count + status pill), paper-card per page (rounded + ring + shadow), and ResizeObserver-driven responsive `<Page width>` so the PDF always fits the pane.
- **Scroll architecture rebuild**: replaced shell `flex flex-wrap` (which silently sized rows to content) with `grid grid-cols-[20rem_minmax(0,1fr)_20rem]`. Added `min-h-0` to [`FileDropZone.tsx`](../../../src/components/chat/FileDropZone.tsx); changed [`ChatUI.tsx`](../../../src/components/chat/ChatUI.tsx) chat grid from `h-full` to `flex-1`. [`LeaseLensWorkspaceShell.test.tsx`](../../../src/components/lease/LeaseLensWorkspaceShell.test.tsx) pins the grid + no-flex-wrap decision so it can't silently regress.

### Phase 10.6 — right-rail clutter fix

[`RedFlagReport.tsx`](../../../src/components/lease/RedFlagReport.tsx) redesigned: collapsible cards (header always visible, body expands on click), severity-coded left bar (no full-card tinting), summary row at top with at-a-glance counts (`4 HIGH · 1 OK`), cards sort high→ok then by clause index, latest grading per clause wins. Inline "View on page N" action calls `pdfViewerRef.scrollToPage`. Tool result enriched with `clause_type` / `clause_index` / `page_number` so the card can label clauses meaningfully. Grading prompt tightened to disambiguate `statute_citation` vs `chunk_id` (was producing `automatic-renewal-notice#section:4` validation errors).

### Phase 10.7 — self-healing corpus

After observing the corpus chunks disappear between dev-server runs (root cause unclear after static analysis), shipped three guards: (1) [`scripts/seed-if-empty.mjs`](../../../scripts/seed-if-empty.mjs) wired into `predev` and `prebuild` auto-runs `db:seed` when `chunks=0`; (2) [`db/index.ts`](../../../src/lib/db/index.ts) logs a startup warning if chunks is empty for SAMPLE_WORKSPACE; (3) `grade_clause_severity` now distinguishes "corpus not loaded" (actionable: run db:seed) from "corpus loaded but no match for this query" (different fix). Together: the chat experience cannot silently fail because the operator forgot to seed.

### Phase 10.8 — UX hardening pass (focused, not a redesign)

Three discrete fixes:

1. **Role/mode switcher → top-header segmented control.** Killed `position: fixed bottom-4 right-4 z-50` floating chrome that overlapped the last red-flag card. Now an inline 3-segment pill with `role="group" + aria-label`. [`RoleSwitcher.tsx`](../../../src/components/auth/RoleSwitcher.tsx), [`page.tsx`](../../../src/app/page.tsx), test: [`RoleSwitcher.test.tsx`](../../../src/components/auth/RoleSwitcher.test.tsx).
2. **Active-clause highlight (V1: page-level + active card).** Added `activeClauseId` to [`ChatStreamContext`](../../../src/components/chat/ChatStreamContext.tsx). "View on page N" sets it for 4s; PdfViewer applies a temporary indigo ring on the matching page block + a sticky `Clause §N · Security deposit · page 1` callout; the triggering card simultaneously gets a matching ring. Text-coordinate-precise highlighting deferred (would need PDF.js TextLayer mapping; called out in plan as out-of-scope for V1).
3. **Email quality (3 layers).** System prompt now explicitly says "call `draft_negotiation_email` ONCE per relevant clause_id, in parallel where possible, pass `reasoning` as `concern_summary` and `statute_citation`. Do NOT re-summarize. Do NOT offer multiple stylistic options." Tool input schema gained optional `concern_summary` + `statute_citation` (chunk-id-shaped citations rejected at the boundary). `DRAFT_INSTRUCTION` rewritten with a tenant-friendly few-shot (`Hi [Landlord Name],` … `My understanding is that NJ …` … `Would you be open to revising …` … `Best, [Your Name]`) and forbidden phrases (`I demand`, `you must`, `violates`, `unenforceable`, `illegal`).

### Phase 10.8.1 — LeaseLens-flavored follow-up prompts

[`follow-up-prompts.ts`](../../../src/lib/chat/follow-up-prompts.ts) replaced ContentOps-era generic chips (`Refine this` / `Show alternatives` / `Continue`) with four tenant-relevant continuations: **Draft emails** · **In plain English** · **Compare to NJ law** · **What to fix first**. Each maps to a real action the agent's tool surface can fulfil.

### Phase 10.8.2 — active-lease awareness in system prompt

The chat route now resolves the lease (via the same `resolveLeaseId` + recent-upload-fallback path the tools use) BEFORE building the system prompt and threads an `ActiveLeaseSummary` ("Active lease IS loaded: filename, X pages, Y clauses, lease_id …") into the prompt. Without this, the model couldn't see the lease (it lives in a side pane, not the message stream) and incorrectly told the user "I don't see an uploaded lease" when one had just been uploaded. Files: [`route.ts`](../../../src/app/api/chat/route.ts), [`system-prompt.ts`](../../../src/lib/chat/system-prompt.ts).

### Phase 10.8.3 — `[Tool use:]` placeholder bug

[`buildMessagesForAnthropic`](../../../src/app/api/chat/route.ts) used to convert persisted `tool_use` rows into `[Tool use: <name>]` plain-text placeholders for the API. The model saw that bracketed pattern in its own assistant history (between iterations of the tool-use loop) and **mirrored it into its final text response**, leaking the placeholder into the chat UI. Fix: round-trip persisted tool turns as proper `{type:'tool_use', id, name, input}` and `{type:'tool_result', tool_use_id, content}` content blocks. [`context-window.ts`](../../../src/lib/chat/context-window.ts) `ContextMessage` widened to `content: string | unknown[]`; `normalizeAlternation` and `trimToLimits` updated to handle mixed string/array merges.

### Cumulative test count over the hotfix series

Started Phase 10 at 461 tests. Ended Phase 10.8.3 at **491**. Net +30 across the series — every hotfix shipped with at least one pinning test.

---

## 13. Phase 11 — Eval harness

**Goal.** Tier 1 retrieval eval (replaces the 5-case Side Quest set with 12 NJ cases) + Tier 2 lease-grading eval (new).

**Tasks.**

1. **`src/lib/evals/golden-set.ts`** — replace the five Side Quest cases with 12 NJ tenant-law cases per spec §3i Tier 1. Coverage: 12 cases, one per issue family from spec §3d, plus 2 cross-cutting (retaliation, habitability). Same `GoldenCase` shape; `expectedChunkIds` reference the new corpus chunk IDs (must match the seed Phase 5 produced).
2. **`src/lib/evals/golden-set.test.ts`** — assert each `expectedChunkIds[i]` resolves in the seeded sample workspace's `chunks` table.
3. **Run `npm run eval:golden`** — must pass with the new corpus. If recall is below 0.85 on any family, the corpus needs another section in that family (reopen Phase 5 briefly).
4. **`src/lib/evals/lease-cases.ts`** — 12 `LeaseGradingCase` rows per spec §3i Tier 2. Each references the seeded sample lease's planted clauses; expected `(clauseType, severity, statuteCitationPrefix)` triples are the ground truth.
5. **`src/lib/evals/lease-grading-runner.ts`** — runs each case via the chat route under `LEASELENS_E2E_MOCK=0` (real Anthropic). Captures tool calls, computes the four metrics from spec §3i Tier 2 table.
6. **`src/lib/evals/lease-grading-runner.test.ts`** — runs against `e2e-mock` (so the test is hermetic) with 2 cases; asserts the runner emits the expected scorecard shape.
7. **`scripts/eval-leases.ts`** — CLI mirroring `scripts/eval-golden.ts`. Writes a JSON report to `data/eval-reports/lease-grading-<runId>.json`.
8. **`package.json`** — add `"eval:leases": "tsx --env-file=.env.local scripts/eval-leases.ts"`.
9. **Run `npm run eval:leases` once** with a real Anthropic key against the seeded sample lease. The first run is the baseline; capture the JSON path in this phase's commit message.
10. **`.github/workflows/eval.yml`** — create the GitHub Actions workflow:
    - Job `tier1`: runs on every PR. `concurrency: { group: eval-${{ github.ref }}, cancel-in-progress: true }`. Steps: checkout, install, `npm run db:seed` (uses an in-runner SQLite file), `npm run eval:golden` with `ANTHROPIC_API_KEY` from secrets. Compares totalScore to `data/eval-reports/baseline-pre-sprint-13.json` (committed) and fails the run if regression > 5%.
    - Job `tier2`: `workflow_dispatch` only. Same setup; runs `npm run eval:leases`. Reports the four metrics; does not gate. Operator runs on demand.

**Verification.**

```
npm run eval:golden
npm run eval:leases     # with ANTHROPIC_API_KEY in env, expects to pass thresholds in spec §3i
npx vitest run src/lib/evals
gh workflow list         # eval.yml visible (after the Phase-1 push or local lint of YAML)
```

**Test count delta:** +5.

---

## 14. Phase 12 — Cockpit two-tier eval display + chat-route MAX bump

**Goal.** Cockpit shows both eval tiers; chat route's iteration cap is bumped per spec §3h.

**Tasks.**

1. **`src/lib/cockpit/eval-reports.ts`** — extend the existing reader to return both tiers' latest reports.
2. **`src/components/cockpit/EvalHealthPanel.tsx`** — render Tier 1 (retrieval) and Tier 2 (lease grading) side by side. Tier 2 shows the four metrics from spec §3i + a "Run Tier 2 (one case)" button gated by the daily spend ceiling.
3. **`src/components/cockpit/EvalHealthPanel.test.tsx`** — extend with the two-tier branch.
4. **`src/app/api/chat/route.ts`** — bump `MAX_TOOL_ITERATIONS` from 3 to 15. Pass `activeLease` (resolved via `getActiveLease(conversationId)`) into `buildSystemPrompt`. Update `SPEND_CEILING_MESSAGE` GitHub URL to the renamed repo (operator confirms in Phase 15 ops step).
5. **`src/app/api/chat/route.integration.test.ts`** — extend with: 15-iteration loop scenario; `activeLease` forwarded to `buildSystemPrompt`.

**Verification.**

```
npx vitest run src/components/cockpit src/app/api/chat
```

**Test count delta:** +3.

---

## 15. Phase 13 — Cleanup + e2e-mock rewrite

**Goal.** Delete the removed files. Rewrite the e2e-mock for the new tool surface.

**Tasks.**

1. **`git rm src/lib/tools/mutating-tools.ts src/lib/tools/mutating-tools.test.ts`**.
2. **`src/lib/anthropic/e2e-mock.ts`** — replace mock responses for `schedule_content_item` / `approve_draft` with deterministic mocks for `extract_clauses`, `grade_clause_severity`, `draft_negotiation_email`. Each mock returns a small fixed payload sufficient to exercise the chat route + UI flow.
3. **`src/lib/anthropic/e2e-mock.test.ts`** — extend.
4. **`tests/e2e/*.spec.ts`** — search for ContentOps-era flow assertions and remove or repoint at the LeaseLens flow. A new lease-flow E2E spec is sprint-plan-decides; the default for Phase 13 is to ship the rename and remove dead assertions.
5. **`README.md`** — Phase 16 will rewrite this; here, just confirm no orphan references to ContentOps remain in code (grep audit).

**Verification.**

```
grep -rn "schedule_content_item\|approve_draft\|Side Quest" src/ tests/
# expected zero hits
npm run typecheck
npm run lint
npx vitest run
```

**Test count delta:** −7 (mutating-tools tests removed) + 2 (e2e-mock test extensions) = net −5.

---

## 16. Phase 14 — Manual smoke (local)

**Goal.** Walk through acceptance criteria 1-13 from spec §4 against a freshly-seeded local dev DB. Record the results in `impl-qa.md` (created in Phase 16).

**Tasks (manual).**

1. `rm data/leaselens.db && npm run db:seed`
2. `npm run dev` and open `http://localhost:3000`
3. Walk AC #1 → #13 in order. For each, capture:
   - Pass / fail
   - Any UX surprise
   - Screenshot or short Loom clip if relevant
4. Any failure surfaces a Phase reopen, not a sprint advance.

**Verification.**

The full charter §10 surface plus the new ones must be green before declaring this phase done:

```
npm run typecheck
npm run lint
npx vitest run
npx playwright test
npm run eval:golden
npm run eval:leases
```

**Test count delta:** 0.

---

## 17. Phase 15 — Vercel deploy + AC #14-15

**Goal.** Public deploy + final live-demo acceptance.

**Tasks (manual + ops).**

1. Operator updates Vercel project env vars: every `CONTENTOPS_*` to `LEASELENS_*` plus the new `LEASELENS_LEASE_MAX_BYTES` and `LEASELENS_LEASE_MAX_PAGES`.
2. Operator confirms (or renames) the GitHub repo to match the new project name. The `SPEND_CEILING_MESSAGE` URL is updated to match in the same commit. Repo rename is a GitHub-side action; the codebase's URL constant is the only file change.
3. `git push` triggers Vercel build. Any build failure surfaces a Phase reopen.
4. Hit the public URL: walk AC #14 (README opens with thesis, architecture diagram, Quick Start, eval badge, Loom embed) and AC #15 (90-second Loom recording shows the end-to-end demo).
5. Demo-mode guards verified live:
   - 11th anonymous chat in an hour returns the rate-limit message.
   - Driving spend to the ceiling returns the ceiling message with the renamed-repo URL.
6. MCP smoke from a separate machine (operator's Claude Desktop): connect via `claude_desktop_config.json` and exercise `extract_clauses` with an explicit `lease_id`.

**Verification.** The deployed URL renders all three panes, the seeded sample lease workflow runs end-to-end, the eval page is publicly readable, and the Loom is embedded in the README.

**Test count delta:** 0.

---

## 18. Phase 16 — README rewrite + Loom + architecture refresh + impl-qa.md

**Goal.** Final docs commit. The portfolio surface lives or dies here.

**Tasks.**

1. **`README.md`** — full rewrite. Opens with the LeaseLens thesis (one paragraph). Includes:
   - Architecture diagram (Mermaid, embedded as a static SVG export so GitHub renders it without a runtime).
   - Quick Start: clone, seed, dev. The `claude_desktop_config.json` block for the LeaseLens MCP server.
   - Acceptance criteria 1–15 summarized as a "What you can demo" section.
   - Eval results badge linking to the live `/cockpit/evals` page.
   - Embedded Loom (90 seconds) per AC #15.
   - Disclaimer (the `LEASELENS_DISCLAIMER` constant, verbatim).
   - License + attribution to NJ tenant-law sources (link to `docs/_meta/corpus-sources.md`).
2. **Record the Loom.** Shot order per spec §4 AC #15: open URL → use sample lease → run scan → click a citation chip → PDF scrolls → severity heatmap renders → draft email → Undo → click eval page. ≤ 90 seconds.
3. **`docs/_meta/architecture.md`** — refresh. The module map gets the new `lease/` directory, the new tools, and the renamed MCP server. The data-model section adds three tables. A new sequence flow F (lease upload → extract → grade → report) is added. Snapshot date bumps to today.
4. **`docs/_meta/agent-charter.md`** — already at v1.13. No further edit unless the sprint surfaced a charter-level issue (none expected at this point).
5. **`docs/_meta/agent-guidelines.md`** — already updated for `MAX_TOOL_ITERATIONS`. Confirm no other rule landed during the sprint that needs codifying (e.g., new lease-tool patterns).
6. **`docs/_specs/sprint-13-leaselens/impl-qa.md`** — produced per charter §7.6. Records the Phase 14 + 15 manual-smoke pass results, the eval baseline numbers, the test-count delta, the lint-count delta, and any sprint-plan-decides items the operator decided differently from the defaults.

**Verification.**

```
git status            # working tree clean
git log --oneline     # phase-by-phase commit history visible
```

The deployed Vercel URL is the final acceptance signal. If the Loom is recorded, the README renders, the eval page is live, and AC #1-15 pass on the public deploy, the sprint is complete.

**Test count delta:** 0.

---

## 19. Completion checklist

The sprint is merge-ready when **all** of the following are true. Charter §10 ("from a clean checkout") applies to every command.

| Gate | Command | Bar |
|---|---|---|
| Typecheck | `npm run typecheck` | Zero errors |
| Lint | `npm run lint` | No increase from Phase-0 baseline |
| Unit + integration | `npx vitest run` | 365 ± 5 tests, all green |
| E2E | `npx playwright test` | All specs pass with `LEASELENS_E2E_MOCK=1` |
| Tier 1 eval | `npm run eval:golden` | All 12 NJ cases pass; total score ≥ baseline JSON |
| Tier 2 eval | `npm run eval:leases` | Red-flag precision ≥ 0.80, recall ≥ 0.75, groundedness ≥ 0.90 |
| MCP server | `npm run mcp:server` + Claude Desktop connection | All 7 tools exposed; explicit `lease_id` works |
| Local smoke | AC #1-13 walk-through | Every step documented in `impl-qa.md` |
| Public deploy | AC #14-15 against deployed URL | Both pass |
| Charter sync | `agent-charter.md`, `agent-guidelines.md`, `architecture.md`, `corpus-sources.md` all reflect Sprint-13 reality | Verified by self-pass before commit |
| Spec lineage | `spec.md`, `spec-qa.md`, `sprint.md`, `sprint-qa.md`, `impl-qa.md` all present in `docs/_specs/sprint-13-leaselens/` | Five files |

If any gate fails, the failing phase reopens. Charter §9 stop-the-line applies if the failure can't be resolved within Sprint 13's scope.

---

## 20. Sprint-plan-decides items resolved here

| Spec §11 item | Resolution in this plan |
|---|---|
| `pdfjs-dist` / `react-pdf` versions | Phase 0 Context7 lookups; recorded in the §2 verification table |
| Dynamic import vs `useEffect` for PDF viewer | Dynamic import via `next/dynamic` per Phase 9 task 1, mirroring Sprint-12 `MermaidDiagram` |
| Synchronous vs deferred clause segmentation | Synchronous in the upload route (Phase 8) per spec §11.3 default |
| File-rename commit ordering | One Phase-1 commit covers all renames atomically (per spec §2.11 invariant) |
| GitHub Actions CI for evals | Sprint plan adds `.github/workflows/eval.yml` in Phase 11 covering Tier 1 on every PR + manual `workflow_dispatch` for Tier 2 |
| README copy + Loom shot order | Phase 16 task 1 + task 2 specify both |
| Sample lease as `.pdf` vs `.md` | `.pdf` (with markdown source committed alongside) per Phase 5 task 4 |
| Eval CI failure thresholds | Tier 1: regression vs JSON baseline. Tier 2: spec §3i thresholds (precision ≥ 0.80, recall ≥ 0.75, groundedness ≥ 0.90) |
| Residual `mutating-tools.test.ts` | Deleted in Phase 13 per default |
| `LEASELENS_DISCLAIMER` exact wording | Phase 3 task 3 ships the default; operator may push back during Phase 14 manual smoke |

---

## 21. Risks pulled forward from spec §8

The spec's risk register applies to this plan. Two risks deserve a phase-level mitigation note here:

- **`pdfjs-dist` Node setup (spec §8 row 1).** Phase 0 Context7 lookup is the first defense; Phase 4 spike with a fixture is the second. If both fail, Phase 4 reopens with a switch to `unpdf` (a maintained pdfjs reskin for Node) — total cost ≤ half a day.
- **Renaming env vars breaks deployed Vercel (spec §8 row 5).** Phase 15 task 1 is explicit about the dashboard rename. If Vercel dashboard credentials are missing on demo day, Phase 15 reopens for the next dev cycle; the local demo still works.
