# Architecture — LeaseLens

**Snapshot date:** 2026-05-29 (post-Sprint 33, on `feature/fab-menu`).

This document describes LeaseLens as it exists in the codebase today. It is **descriptive** (what is), not **prescriptive** (what should be). For planned changes see [`docs/_specs/`](../_specs/) and the most-recent sprint folder. For *how to write code*, see [`agent-guidelines.md`](agent-guidelines.md). For governance, see [`agent-charter.md`](agent-charter.md). For the day-to-day operating rules and invariants, see [`CLAUDE.md`](../../CLAUDE.md).

> Sprints 0–12 shipped the original ContentOps cockpit (the same registry / RAG / audit / eval infrastructure under a media-brand framing). Sprint 13 pivoted the corpus and tool surface to NJ residential leases. Sprint 14 added the second eval tier + cockpit display. Sprints 16–18 modernised the workspace UI (welcome state, scan progress, severity polish). Sprints 23a–23k brought the editorial brand refresh (cream/terracotta palette, Source Serif 4, ink-blue citation token). Sprints 26a–26c **pivoted the workspace from a three-pane shell to a parser-first router (`WorkspaceRouterShell`) with chat in a floating FAB drawer (`AssistantFab`)**. Sprints 27–28 hardened the FAB persistence and tenant-only UI; Sprints 29.1–29.13 refactored the FAB+chat production UX. Sprints 30–32 added the View-Transitions theme flip, scan-prompt disambiguation, and forced `tool_choice` on auto-scan. Sprint 33 (in progress on `feature/fab-menu`) is iterating on the FAB chat surface. The architecture preserves every charter §4 invariant from the ContentOps era; what has changed since Sprint 13 is the corpus, the tool surface, the lease ingestion path, and the entire workspace UI topology.

---

## 1. Product shape

LeaseLens is a NJ residential lease red-flag reviewer. The full user story:

1. Operator visits `/`. Middleware ensures a session cookie (Tenant role default) and a workspace cookie (sample fallback).
2. The home page renders [`WorkspaceRouterShell`](../../src/components/lease/WorkspaceRouterShell.tsx), which routes between two modes:
   - **Mode A — `ParserLandingShell`**: hero dropzone with the LeaseLens wordmark, an upload affordance, and the seeded sample-lease CTA. Renders when no active lease is rehydrated from the conversation.
   - **Mode B — `ParserResultsShell`**: two-column parser workspace. PDF viewer on the left; a results stack on the right (Red Flags → Clauses).
3. Chat lives in a **floating FAB drawer** ([`AssistantFab`](../../src/components/chat/AssistantFab.tsx)), anchored bottom-right and available in Mode B. The drawer is opt-in: it **lazy-mounts on first open and stays mounted** thereafter, so typed drafts and the conversation survive close → reopen. Card actions on red-flag cards and clause rows ("Explain", "Draft email") open the drawer pre-seeded via `fab.openWith({ initialPrompt, clauseId, severity, statuteCitation })`.
4. Operator can switch role (Tenant / Reviewer / Admin) via the role switcher in the header (demo mode only; hidden in production). Tools are filtered by role; lease ownership is enforced separately so a Tenant only sees leases they uploaded.
5. Operator types into the FAB composer; on send, the assistant streams a response that may use one or more tools. The standard scan flow chains `extract_clauses` → repeated `grade_clause_severity`, with the right-hand Red Flags pane filling in as gradings come back. On a fresh in-session upload, [`AutoScanRunner`](../../src/components/lease/AutoScanRunner.tsx) auto-fires the scan when `LEASELENS_AUTO_SCAN_ENABLED=true` — see Sprint 32 (force `tool_choice`) for the per-call diagnostic.
6. Each `grade_clause_severity` result carries a NJ statute citation and a `chunk_id`; the tool throws if the citation is not grounded in the retrieved corpus chunk. Failed citations surface as error pills.
7. Operator can drag a different lease PDF into the upload dropzone — the route parses, segments, classifies, and inserts clauses; the **Replace** action in `ParserResultsShell`'s header is the only destructive workspace-reset path (requires `window.confirm`, revokes the active Blob URL, evicts the IndexedDB-cached PDF bytes).
8. **Clear assistant chat** (button inside the FAB drawer) resets *only* the chat thread. It does not touch the lease, extracted clauses, or red flags — an aria-live announcer says so explicitly for SR users.
9. Operator (Tenant or Admin) asks the assistant to draft a negotiation email about a graded clause. `draft_negotiation_email` runs the LLM call in a `prepare` step, then writes the `negotiation_emails` row + audit_log row in one transaction. The `ToolCard` UI surfaces an Undo button until rolled back.
10. Operator (Reviewer or Admin) opens `/cockpit` for the operator dashboard: today's spend, audit feed, scheduled emails, and a two-tier eval-health panel (Tier 1 retrieval + Tier 2 lease grading side-by-side). The Cockpit link in the header is hidden in production / Tenant-only mode (Sprint 27).

The seeded sample is `SAMPLE_LEASE_ID` (`00000000-0000-0000-0000-000000000020`), a fictional NJ residential lease whose clauses cover security deposit overcharge, late-fee structure, and other typical red-flag patterns.

---

## 2. Runtime topology

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                                Browser                                   │
 │  app/layout.tsx (server component, html/body, Tailwind)                  │
 │  └── app/page.tsx (server) → WorkspaceRouterShell (client)               │
 │       ├── ParserLandingShell        (Mode A: hero + dropzone)            │
 │       └── ParserResultsShell        (Mode B: post-upload workspace)      │
 │            │  providers (pinned order):                                  │
 │            │    AssistantFabProvider                                     │
 │            │      └── LeaseParserProvider                                │
 │            │           └── ChatStreamProvider                            │
 │            │                                                             │
 │            ├── PdfViewer            (react-pdf over pdfjs-dist)          │
 │            ├── RedFlagReport        (severity cards + citation chips)    │
 │            ├── ClausesList          (clause rows with Explain action)    │
 │            ├── AutoScanRunner       (fires standard scan on fresh upload)│
 │            └── AssistantFab         (floating drawer; lazy-mounts on     │
 │                                      first open; stays mounted)          │
 │  └── app/cockpit/page.tsx (server) → CockpitDashboard (panels)           │
 └──────────────────────────────────────────────────────────────────────────┘
                                       │ HTTP / streaming fetch
                                       ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                       Next.js 16 (Node.js runtime)                       │
 │   src/middleware.ts                                                      │
 │      ├─ ensure session cookie (Tenant default)                           │
 │      └─ ensure workspace cookie (sample fallback)                        │
 │   src/app/api/chat/route.ts          POST  ndjson streaming              │
 │   src/app/api/leases/route.ts        POST  multipart PDF upload          │
 │   src/app/api/leases/[id]/route.ts   GET   clauses + draft emails        │
 │   src/app/api/audit/route.ts         GET   role-filtered audit list      │
 │   src/app/api/audit/[id]/rollback    POST  idempotent rollback           │
 │   src/app/api/workspaces/route.ts    POST  upload + ingest               │
 │   src/app/api/workspaces/select-sample POST  cookie swap                 │
 │                                                                          │
 │   src/lib/db/index.ts (singleton better-sqlite3 handle, WAL)             │
 │   src/lib/anthropic/client.ts (singleton, env-gated mock)                │
 │   src/lib/rag/embed.ts (lazy Xenova WASM pipeline)                       │
 └──────────────────────────────────────────────────────────────────────────┘
                          │                         │
                          ▼                         ▼
            api.anthropic.com/v1/messages    ./data/leaselens.db
            (model = env.LEASELENS_          (SQLite file, WAL mode)
             ANTHROPIC_MODEL,
             default claude-haiku-4-5)

 Side process (not part of the Next.js app):
 ┌──────────────────────────────────────────────────────────────────────────┐
 │   mcp/leaselens-server.ts (npm run mcp:server)                           │
 │   stdio transport; exposes the same registry via                         │
 │   toolRegistry.execute(...) against the same SQLite file.                │
 │   Hardcoded role=Admin, workspace=sample.                                │
 └──────────────────────────────────────────────────────────────────────────┘
```

There is no background worker, no cron, no message queue. Mutations are synchronous. Workspace TTL purge is lazy on the upload route. Embedding pipeline initializes lazily on the first `embedBatch` call. PDF parsing is synchronous on the upload route — the 1 MB / 30-page caps keep this acceptable.

### Provider tree (pinned)

The Mode-B subtree is wrapped in three React contexts in this exact order — do not reorder:

```
AssistantFabProvider     // drawer state: closed/drawer, pendingPrompt, selection
  └── LeaseParserProvider   // activeLease, toolEvents, activeClauseId, pdfViewerRef
       └── ChatStreamProvider  // chat-only: viewerRole, autoScanConversationId
```

State ownership is enforced by the separation:

- `LeaseParserContext` owns parser state. Hooks: `useLeaseParser()`.
- `ChatStreamContext` is chat-only. **Parser fields are explicitly excluded.** The exposed-keys boundary is pinned by a Vitest test ([`ChatStreamContext.test.tsx`](../../src/components/chat/ChatStreamContext.test.tsx)) that fails immediately if a parser field is re-added.
- `AssistantFabContext` owns drawer state, the pending prompt (used by `fab.openWith(...)` to seed the composer on cross-card actions), and the current selection. Hooks: `useAssistantFab()`.

Components must read parser state via `useLeaseParser()`, chat state via `useChatStream()`, FAB state via `useAssistantFab()`. Do not reach across contexts.

---

## 3. Module map

### Web (`src/app/`)

| Path | Purpose |
|---|---|
| [`layout.tsx`](../../src/app/layout.tsx) | Root server layout, html/body, Tailwind import. |
| [`page.tsx`](../../src/app/page.tsx) | Server entry. Resolves session + workspace + latest conversation, rehydrates messages + tool events + active lease snapshot, hands payload to `WorkspaceRouterShell`. |
| [`globals.css`](../../src/app/globals.css) | `@import "tailwindcss"` + minimal base layer + theme tokens. |
| [`onboarding/`](../../src/app/onboarding/) | Brand-upload wizard (legacy; pre-LeaseLens workspace flow — not on the parser-first home path). |
| [`cockpit/page.tsx`](../../src/app/cockpit/page.tsx) | Operator cockpit. Reviewer+ only; Tenant redirects home. Link hidden when `LEASELENS_DEMO_MODE=false`. |
| [`api/chat/route.ts`](../../src/app/api/chat/route.ts) | POST → NDJSON streaming chat with tool-use loop (max 3 iterations). Sprint 32 forces `tool_choice` on auto-scan and emits a dev-only per-call diagnostic. |
| [`api/leases/route.ts`](../../src/app/api/leases/route.ts) | POST multipart PDF → parse + segment + classify + insert. Validates against `LEASELENS_LEASE_MAX_BYTES` and `LEASELENS_LEASE_MAX_PAGES`. |
| [`api/leases/[id]/route.ts`](../../src/app/api/leases/[id]/route.ts) | GET lease + clauses + draft emails (lease-ownership-checked). |
| [`api/audit/route.ts`](../../src/app/api/audit/route.ts) | GET role-filtered audit log. |
| [`api/audit/[id]/rollback/route.ts`](../../src/app/api/audit/[id]/rollback/route.ts) | POST idempotent rollback via compensating action. |
| [`api/workspaces/route.ts`](../../src/app/api/workspaces/route.ts) | POST multipart upload → ingest → cookie set. |
| [`api/workspaces/select-sample/route.ts`](../../src/app/api/workspaces/select-sample/route.ts) | POST swap to sample workspace cookie. |

### Domain (`src/lib/`)

| Path | Purpose |
|---|---|
| [`db/schema.ts`](../../src/lib/db/schema.ts) | DDL for the 14-table schema (11 retained from ContentOps + `leases`, `clauses`, `negotiation_emails`). |
| [`db/migrate.ts`](../../src/lib/db/migrate.ts) | Idempotent boot-time migration. |
| [`db/index.ts`](../../src/lib/db/index.ts) | Singleton DB handle, pragmas (`journal_mode=WAL`, `foreign_keys=ON`), schema bootstrap. |
| [`db/spend.ts`](../../src/lib/db/spend.ts) | `recordSpend`, `getTodaySpend`, `isSpendCeilingExceeded`. |
| [`db/rate-limit.ts`](../../src/lib/db/rate-limit.ts) | Sliding-window 10 req/hour per session id. |
| [`auth/session.ts`](../../src/lib/auth/session.ts) | jose-signed JWT session cookie (HS256, 24h). |
| [`auth/constants.ts`](../../src/lib/auth/constants.ts) | Three demo users with stable IDs (literal `Creator`/`Editor`/`Admin` — UI labels are Tenant/Reviewer/Admin). |
| [`auth/role-labels.ts`](../../src/lib/auth/role-labels.ts) | Single bridge between DB-level role literals and UI/prompt-facing labels. |
| [`anthropic/client.ts`](../../src/lib/anthropic/client.ts) | Singleton SDK client; swaps in `e2e-mock` when `LEASELENS_E2E_MOCK=1`. |
| [`anthropic/e2e-mock.ts`](../../src/lib/anthropic/e2e-mock.ts) | Deterministic mock for Playwright runs. Knows the lease toolset. |
| [`chat/system-prompt.ts`](../../src/lib/chat/system-prompt.ts) | Build role-aware, workspace-aware prompt with RAG context block + LeaseLens disclaimer. Sprint 31 disambiguates lease metadata to stop the "scan already done" hallucination. |
| [`chat/context-window.ts`](../../src/lib/chat/context-window.ts) | Slice conversation history to fit token budget. Sprint 14 hotfix: post-trim drop loop strips messages with leading orphan `tool_result` blocks. |
| [`chat/conversations.ts`](../../src/lib/chat/conversations.ts) | Workspace-scoped conversation queries. |
| [`chat/parse-stream-line.ts`](../../src/lib/chat/parse-stream-line.ts) | Client-side NDJSON line parser. |
| [`chat/rehydrate-history.ts`](../../src/lib/chat/rehydrate-history.ts) | Server-side rebuild of `ChatMessageProps[]` + `ToolEvent[]` from persisted messages — feeds the SSR payload to the router shell. |
| [`tools/domain.ts`](../../src/lib/tools/domain.ts) | `ToolDescriptor` (with optional async `prepare`), `MutationOutcome`, `ToolExecutionContext`. |
| [`tools/registry.ts`](../../src/lib/tools/registry.ts) | RBAC dispatch + sync-transaction wrapping for mutating tools. Honours `prepare` outside the transaction. |
| [`tools/create-registry.ts`](../../src/lib/tools/create-registry.ts) | Wires the 7 tools to the DB handle (4 retained corpus/visualization + 3 new lease). |
| [`tools/corpus-tools.ts`](../../src/lib/tools/corpus-tools.ts) | Read-only: `search_corpus`, `get_document_summary`, `list_documents`. Descriptions rewritten for NJ tenant law. |
| [`tools/lease-tools.ts`](../../src/lib/tools/lease-tools.ts) | `extract_clauses`, `grade_clause_severity`, `draft_negotiation_email`. The grading tool validates citation grounding before returning; the email tool runs Anthropic in `prepare` and the DB write in `execute`. |
| [`tools/diagram-tools.ts`](../../src/lib/tools/diagram-tools.ts) | Visualization: `render_workflow_diagram`. |
| [`tools/audit-log.ts`](../../src/lib/tools/audit-log.ts) | `writeAuditRow`, `getAuditRow`, `listAuditRows`, `markRolledBack`. |
| [`lease/parse-pdf.ts`](../../src/lib/lease/parse-pdf.ts) | `parsePdf(buffer)` via `pdfjs-dist`. Returns `{ pageCount, pages: { pageNumber, text }[] }`. Detects empty text layers (`MIN_PAGE_TEXT_CHARS = 30` per page). |
| [`lease/segment-clauses.ts`](../../src/lib/lease/segment-clauses.ts) | Page-text → clause segments. Splits on `1.` / `(a)` / `ARTICLE I` numbered prefixes. |
| [`lease/classify-clause.ts`](../../src/lib/lease/classify-clause.ts) | Heuristic classifier → `ClauseType` (security_deposit, late_fee, early_termination, …, unknown). |
| [`lease/queries.ts`](../../src/lib/lease/queries.ts) | `getLease`, `listClauses`, `listEmailsForLease`, `getActiveLeaseSnapshot`, etc. All workspace-scoped. |
| [`lease/assert-lease-ownership.ts`](../../src/lib/lease/assert-lease-ownership.ts) | Single helper: Tenant only sees leases where `uploaded_by === ctx.userId`; Reviewer + Admin see all. Called by every lease tool and the `/api/leases/[id]` route guard. |
| [`lease/resolve-lease-id.ts`](../../src/lib/lease/resolve-lease-id.ts) | Resolve `lease_id` from tool input, falling back to `conversation.active_lease_id` and (chat path only) the most-recent upload. |
| [`lease/validate-upload.ts`](../../src/lib/lease/validate-upload.ts) | Pure function: `{ ok: true, file } \| { ok: false, error }`. Enforces size + page caps. |
| [`lease/pdf-binary-repository.ts`](../../src/lib/lease/pdf-binary-repository.ts) | IndexedDB-backed PDF bytes cache. Survives role-switch / cockpit round-trips; evicted on Replace. |
| [`lease/disclaimer.ts`](../../src/lib/lease/disclaimer.ts) | Single-source `LEASELENS_DISCLAIMER` string. Imported by home, chat empty state, system prompt, and README. |
| [`rag/embed.ts`](../../src/lib/rag/embed.ts) | Lazy Xenova `all-MiniLM-L6-v2` pipeline; L2-normalized Float32 output. |
| [`rag/chunk-document.ts`](../../src/lib/rag/chunk-document.ts) | Hierarchical chunking (document / section / passage). |
| [`rag/ingest.ts`](../../src/lib/rag/ingest.ts) | `ingestMarkdownFile`, `ingestCorpus`. Optional `forceDocumentId` for deterministic seed-path chunk IDs. |
| [`rag/retrieve.ts`](../../src/lib/rag/retrieve.ts) | Hybrid retrieval: vector + BM25 + RRF, workspace-scoped. Queries `chunks` only — never reads from `clauses`. |
| [`rag/bm25.ts`](../../src/lib/rag/bm25.ts) | Tokenization + BM25 scoring. |
| [`workspaces/constants.ts`](../../src/lib/workspaces/constants.ts) | `SAMPLE_WORKSPACE`, `WORKSPACE_TTL_SECONDS = 86400`. |
| [`workspaces/cookie.ts`](../../src/lib/workspaces/cookie.ts) | jose-signed JWT workspace cookie. Reuses `LEASELENS_SESSION_SECRET`. |
| [`workspaces/queries.ts`](../../src/lib/workspaces/queries.ts) | `getActiveWorkspace`, `listVisitorBrands`. |
| [`workspaces/cleanup.ts`](../../src/lib/workspaces/cleanup.ts) | `purgeExpiredWorkspaces` — child-first cascade. |
| [`cockpit/queries.ts`](../../src/lib/cockpit/queries.ts) | Cockpit panel data: audit, scheduled emails, spend. |
| [`cockpit/eval-reports.ts`](../../src/lib/cockpit/eval-reports.ts) | Read latest Tier 1 + Tier 2 eval JSON from disk. |
| [`evals/runner.ts`](../../src/lib/evals/runner.ts) | Tier 1 — iterate golden cases, retrieve, score, aggregate. |
| [`evals/golden-set.ts`](../../src/lib/evals/golden-set.ts) | Tier 1 — 12 NJ tenant-law retrieval cases with expected chunk IDs and keywords. |
| [`evals/lease-cases.ts`](../../src/lib/evals/lease-cases.ts) | Tier 2 — 12 curated lease-clause grading cases (clause text + expected severity + expected statute). |
| [`evals/lease-grading-runner.ts`](../../src/lib/evals/lease-grading-runner.ts) | Tier 2 — drive `grade_clause_severity` against the seeded sample lease, compare results to expectations. |
| [`evals/scoring.ts`](../../src/lib/evals/scoring.ts) | Precision@K, Recall@K, MRR, Groundedness. |
| [`evals/reporter.ts`](../../src/lib/evals/reporter.ts) | Write JSON eval reports to `data/eval-reports/`. |
| [`test/db.ts`](../../src/lib/test/db.ts) | In-memory SQLite for tests. |
| [`test/seed.ts`](../../src/lib/test/seed.ts) | Test factories: `seedUser`, `seedWorkspace`, `seedDocument`, `seedLease`. |
| [`env.ts`](../../src/lib/env.ts) | Centralised env-var access (`LEASELENS_*`). |

### Components (`src/components/`)

| Path | Purpose |
|---|---|
| [`lease/WorkspaceRouterShell.tsx`](../../src/components/lease/WorkspaceRouterShell.tsx) | Sprint 26a — routes between Mode A (no active lease) and Mode B (active lease). Holds the live-active-lease + fresh-upload state so an in-session upload transitions modes without a full page refresh. |
| [`lease/ParserLandingShell.tsx`](../../src/components/lease/ParserLandingShell.tsx) | Sprint 26a — Mode A. Hero dropzone + sample-lease CTA. |
| [`lease/ParserResultsShell.tsx`](../../src/components/lease/ParserResultsShell.tsx) | Sprint 26b/26c — Mode B. PDF on the left, results stack on the right, `AssistantFab` bottom-right. Wraps subtree in `AssistantFabProvider` → `LeaseParserProvider` → `ChatStreamProvider`. |
| [`lease/LeaseParserContext.tsx`](../../src/components/lease/LeaseParserContext.tsx) | Sprint 28.6 — owns parser state (`activeLease`, `toolEvents`, `activeClauseId`, `pdfViewerRef`). Hooks: `useLeaseParser()`. |
| [`lease/PdfViewer.tsx`](../../src/components/lease/PdfViewer.tsx) | `react-pdf` viewer with scroll-to-page handle for citation chips. |
| [`lease/RedFlagReport.tsx`](../../src/components/lease/RedFlagReport.tsx) | Severity cards (high/medium/low/ok) with statute chip + reasoning + recommended action. Card actions open the FAB via `fab.openWith(...)`. |
| [`lease/RedFlagsPaneHeader.tsx`](../../src/components/lease/RedFlagsPaneHeader.tsx) | Replaces the inline header the legacy three-pane shell used. |
| [`lease/ClausesList.tsx`](../../src/components/lease/ClausesList.tsx) | Clause rows with "Explain" action; consumes parser state. |
| [`lease/AutoScanRunner.tsx`](../../src/components/lease/AutoScanRunner.tsx) | Sprint 26c.10 — fires the standard scan automatically on a fresh in-session upload when `LEASELENS_AUTO_SCAN_ENABLED=true`. |
| [`lease/CitationChip.tsx`](../../src/components/lease/CitationChip.tsx) | Renders a NJ statute citation; clicking scrolls the PdfViewer to the cited clause page. |
| [`lease/LeaseUploadDropzone.tsx`](../../src/components/lease/LeaseUploadDropzone.tsx) | Drag-and-drop PDF upload affordance. |
| [`lease/LeaseLensWorkspaceShell.tsx`](../../src/components/lease/LeaseLensWorkspaceShell.tsx) | **Dead production code.** Pre-Sprint-26 three-pane shell; only its colocated test imports it, and a handful of code comments reference it as "legacy". Slated for removal. Do not add new dependencies on it. |
| [`chat/AssistantFab.tsx`](../../src/components/chat/AssistantFab.tsx) | Sprint 26c / 29 — the floating chat drawer. Anchored bottom-right; lazy-mounts on first open, stays mounted thereafter so drafts survive close→reopen. |
| [`chat/AssistantFabContext.tsx`](../../src/components/chat/AssistantFabContext.tsx) | Drawer state, pending prompt (for `fab.openWith(...)` cross-card actions), and selection. Hooks: `useAssistantFab()`. |
| [`chat/ChatStreamContext.tsx`](../../src/components/chat/ChatStreamContext.tsx) | Chat-only context — `viewerRole`, `autoScanConversationId`. The exposed-keys boundary is pinned by a Vitest test (do not re-add parser fields here). |
| [`chat/ChatUI.tsx`](../../src/components/chat/ChatUI.tsx) | NDJSON stream reader + message state. Mounted inside the FAB drawer. |
| [`chat/ChatTranscript.tsx`](../../src/components/chat/ChatTranscript.tsx) | Per-conversation transcript rendering inside the drawer. |
| [`chat/ChatMessage.tsx`](../../src/components/chat/ChatMessage.tsx) | Per-turn message renderer. Motion-animated assistant entry; user messages plain. |
| [`chat/ToolCard.tsx`](../../src/components/chat/ToolCard.tsx) | Tool-result card. Branches to `MermaidDiagram` for the diagram tool; renders Undo for mutating-tool results. |
| [`chat/MermaidDiagram.tsx`](../../src/components/chat/MermaidDiagram.tsx) | Client-only Mermaid renderer. |
| [`chat/TypingIndicator.tsx`](../../src/components/chat/TypingIndicator.tsx) | Pre-first-token pulse. |
| [`auth/RoleSwitcher.tsx`](../../src/components/auth/RoleSwitcher.tsx) | Role swap → updates session cookie. Demo-mode only. |
| [`auth/ThemeToggle.tsx`](../../src/components/auth/ThemeToggle.tsx) | system / light / dark cycle. Sprint 30 — uses the View Transitions API with a double-rAF fallback for a smoother flip. |
| [`brand/LeaseLensMark.tsx`](../../src/components/brand/LeaseLensMark.tsx) | Bespoke document+magnifier mark with a one-shot scan-sweep on mount (Sprint 17.2). |
| [`cockpit/EvalHealthPanel.tsx`](../../src/components/cockpit/EvalHealthPanel.tsx) | Two-tier eval display (Sprint 14 Phase 12) — Tier 1 + Tier 2 side-by-side, 6-metric grid. |
| [`cockpit/AuditFeedPanel.tsx`](../../src/components/cockpit/AuditFeedPanel.tsx) | Audit log feed with role-filtered visibility. |
| [`cockpit/SchedulePanel.tsx`](../../src/components/cockpit/SchedulePanel.tsx) | Drafted negotiation emails. |
| [`cockpit/SpendPanel.tsx`](../../src/components/cockpit/SpendPanel.tsx) | Today's spend vs the demo ceiling. |
| [`workspaces/`](../../src/components/workspaces/) | Workspace switcher + onboarding modal. |

### MCP, scripts, seed (`mcp/`, `scripts/`, `src/db/`)

| Path | Purpose |
|---|---|
| [`mcp/leaselens-server.ts`](../../mcp/leaselens-server.ts) | stdio MCP server; wraps `toolRegistry.execute`. |
| [`scripts/copy-pdf-worker.mjs`](../../scripts/copy-pdf-worker.mjs) | Copies the `pdfjs` worker into `public/` (postinstall + predev). |
| [`scripts/seed-if-empty.mjs`](../../scripts/seed-if-empty.mjs) | predev hook — runs the seed when the `chunks` table is empty. |
| [`scripts/eval-golden.ts`](../../scripts/eval-golden.ts) | Tier 1 CLI wrapper around `runGoldenEval`; writes report. |
| [`scripts/eval-leases.ts`](../../scripts/eval-leases.ts) | Tier 2 CLI wrapper around the lease-grading runner. |
| [`scripts/diag-db.mjs`](../../scripts/diag-db.mjs) | Read-only diagnostic snapshot of dev DB. |
| [`src/db/seed.ts`](../../src/db/seed.ts) | Bootstrap dev DB: schema + migrate + sample workspace + demo users + NJ tenant-law corpus + sample lease (`SAMPLE_LEASE_ID`). |

---

## 4. Data model

14 tables. Six are workspace-scoped (`documents`, `chunks`, `audit_log`, `conversations`, `leases`, `clauses`); `negotiation_emails` is workspace-scoped via `clauses.workspace_id`; the rest are global. Two ContentOps-era tables (`content_calendar`, `approvals`) remain in the schema but are no longer written to — the tools that produced them were removed in Sprint 13.

### Workspace-scoped tables

| Table | Notable columns | Per-workspace constraint | Indexes |
|---|---|---|---|
| `documents` | `slug`, `workspace_id`, `title`, `content`, `content_hash` | composite UNIQUE on (`slug`, `workspace_id`) | `idx_documents_slug_workspace`, `idx_documents_workspace` |
| `chunks` | `document_id` FK, `workspace_id`, `chunk_index`, `chunk_level`, `embedding` BLOB | — | `idx_chunks_workspace` |
| `audit_log` | `tool_name`, `actor_user_id`, `actor_role`, `workspace_id`, `input_json`, `output_json`, `compensating_action_json`, `status`, `rolled_back_at` | — | `idx_audit_log_workspace`, `idx_audit_log_actor`, `idx_audit_log_created` |
| `conversations` | `user_id` FK, `workspace_id`, `title`, `active_lease_id` (Sprint 13) | — | `idx_conversations_workspace` |
| `leases` | `id`, `workspace_id`, `uploaded_by` FK → users, `original_filename`, `byte_size`, `page_count`, `created_at` | — | `idx_leases_workspace`, `idx_leases_uploaded_by` |
| `clauses` | `id`, `lease_id` FK, `workspace_id`, `clause_index`, `clause_type`, `text`, `page_number` | — | `idx_clauses_lease`, `idx_clauses_workspace` |
| `negotiation_emails` | `id`, `clause_id` FK, `workspace_id`, `tone`, `subject`, `body`, `drafted_by`, `created_at` | — | `idx_negotiation_emails_clause`, `idx_negotiation_emails_workspace` |

### Global tables

| Table | Purpose |
|---|---|
| `workspaces` | `id`, `name`, `description`, `is_sample`, `created_at`, `expires_at`. |
| `users` | `id`, `email` UNIQUE, `role` ('Creator'\|'Editor'\|'Admin'), `display_name`. Three rows seeded for demo. |
| `messages` | `id`, `conversation_id` FK, `role`, `content`, `tokens_in`, `tokens_out`. |
| `spend_log` | `date` (PK, ISO YYYY-MM-DD), `tokens_in`, `tokens_out`. |
| `rate_limit` | `session_id` (PK), `window_start`, `count`. |

### Legacy tables (retained but unused)

`content_calendar` and `approvals` were the ContentOps-era write targets for `schedule_content_item` / `approve_draft`. Sprint 13 removed those tools but left the tables in the schema to keep the migration linear. They carry no rows in any seeded or upload path.

### Foreign keys

Declared in [`schema.ts`](../../src/lib/db/schema.ts):

- `conversations.user_id REFERENCES users(id)`
- `messages.conversation_id REFERENCES conversations(id)`
- `chunks.document_id REFERENCES documents(id)`
- `clauses.lease_id REFERENCES leases(id)`
- `negotiation_emails.clause_id REFERENCES clauses(id)`

No `ON DELETE` clauses (default = NO ACTION). FK enforcement is on at boot — both via the library default and the explicit `db.pragma('foreign_keys = ON')`. Workspace deletion is application-level cascade in [`workspaces/cleanup.ts`](../../src/lib/workspaces/cleanup.ts) (child-first).

### Embeddings storage

`chunks.embedding` is a BLOB of L2-normalized Float32 (Xenova `all-MiniLM-L6-v2`, 384-dim). No FTS5 virtual table, no separate vector index. Retrieval reads the BLOB into a `Float32Array` and dot-products in JS. BM25 is a separate scoring pass over the same chunk set, then fused via Reciprocal Rank Fusion.

**`chunks` holds the NJ tenant-law corpus only.** Lease text lives in `clauses` and is never embedded — `retrieve.ts` queries `chunks` and so always grounds in NJ statutes, not in the user's own document. This is the §2.2 invariant from the Sprint 13 spec.

---

## 5. Sequence flows

### A. Chat streaming (user → LLM → UI)

```
Client                         Next.js route                       Anthropic API           SQLite
───────                       ─────────────                       ───────────────         ────────
fetch POST /api/chat ────► route.ts:POST
                              │ Zod parse body
                              │ resolve session + workspace cookies
                              │ rate-limit + spend ceiling (demo mode)
                              │ load conversation history
                              │ retrieve(message, db, workspace) ──────────────────────► chunks SELECT
                              │ buildSystemPrompt({role, workspace, context, disclaimer})
                              │ open ReadableStream (NDJSON)
                              │
                              │ ┌─ tool-use loop (≤3 iters) ─┐
                              │ │ messages.create (non-stream) ──► api ◄────────── tool_use blocks
                              │ │ for each tool_use:
                              │ │   toolRegistry.execute(name, input, ctx)
                              │ │     ├─ RBAC check
                              │ │     ├─ if descriptor.prepare:
                              │ │     │     prepared = await prepare(input, ctx)   (e.g. Anthropic call)
                              │ │     └─ if mutating:
                              │ │         db.transaction(() => {
                              │ │           outcome = descriptor.execute(input, ctx, prepared)
                              │ │           writeAuditRow(...)                 ── INSERT audit_log
                              │ │         })
                              │ │   emit tool_use event line                ┐
                              │ │   emit tool_result event line (audit_id)  │ NDJSON
                              │ │   persist tool messages                   │ stream
                              │ └────────────────────────────┘              │
                              │                                              │
                              │ messages.stream (final) ──► api ◄── text deltas
                              │ INSERT messages (assistant) + recordSpend
                              │ controller.close()
client reads NDJSON ◄────────┘
```

Streaming pattern: NDJSON, one JSON object per line, `Content-Type: application/x-ndjson`. Final assistant message persisted after stream closes. `recordSpend` only runs in demo mode. Sprint 32 forces `tool_choice` on auto-scan turns and emits a dev-only per-call diagnostic line (gated by `NODE_ENV === 'development'`).

### B. RAG retrieval

```
retrieve(query, db, {workspaceId})
  │ 1. embedBatch([query]) → queryVec (L2-normalized Float32)
  │ 2. SELECT chunks WHERE workspace_id = ? AND chunk_level IN ('section','passage')
  │ 3. for each chunk: vectorScore = dot(queryVec, chunkVec)
  │ 4. tokenize + bm25Score on the same chunk set
  │ 5. RRF fuse: rrfScore = Σ over rankings of 1 / (k + rank)
  │ 6. sort desc by rrfScore, slice top-K
  └→ return RetrievedChunk[]
```

Workspace-scoping is in step 2. Vector and BM25 ranks are merged, not weighted — RRF is robust to score-scale differences. `chunks` holds NJ tenant-law only, so retrieval cannot leak between workspaces *or* between the corpus and the lease pipeline.

### C. PDF upload → clauses

```
POST /api/leases (multipart form)
  │ parse FormData: file
  │ validateUpload(file) → ok | { error: 'too_large' | 'too_many_pages' | ... }
  │
  │ db.transaction(() => {
  │   parsed = parsePdf(buffer)                         // pdfjs-dist
  │   if every page text < MIN_PAGE_TEXT_CHARS:
  │     throw 422 { error: 'pdf_no_text_layer' }       // OCR out of scope
  │
  │   leaseId = uuid()
  │   INSERT INTO leases (id, workspace_id, uploaded_by, ...)
  │
  │   for page in parsed.pages:
  │     for segment in segmentClauses(page):
  │       clauseType = classifyClause(segment.text)
  │       INSERT INTO clauses (id, lease_id, workspace_id,
  │                            clause_index, clause_type, text, page_number)
  │
  │   UPDATE conversations SET active_lease_id = leaseId
  │     WHERE id = ctx.conversationId
  │ })()
  │
  └→ return { lease_id, page_count, clause_count }
```

The route is synchronous. The 1 MB / 30-page caps keep parse time within the dev-server response window. Empty-text-layer PDFs return 422 with a paste-text-fallback hint (paste-text fallback itself is on the backlog, not yet implemented).

### D. Mutating tool — `draft_negotiation_email` with `prepare`

The `ToolDescriptor` carries an optional `prepare(input, ctx) => Promise<unknown>` method. The registry calls it *before* opening the SQLite transaction so a slow Anthropic call never blocks writers.

```
toolRegistry.execute('draft_negotiation_email', input, ctx)
  │ assert canExecute(name, ctx.role)
  │
  │ // OUTSIDE the transaction — async OK here
  │ prepared = await descriptor.prepare(input, ctx)
  │   ├─ assertLeaseOwnership (Tenant scoping)
  │   ├─ Anthropic messages.create({ model, prompt: tone + concern + citation + clause text })
  │   └─ parse JSON → { subject, body, clauseId, tone, clause }
  │
  │ // SYNC transaction — better-sqlite3 cannot await
  │ db.transaction(() => {
  │   const id = uuid()
  │   INSERT INTO negotiation_emails (id, clause_id, ...)
  │   audit_id = writeAuditRow(db, {
  │     tool_name, tool_use_id, context, input,
  │     output: { email_id: id, ... },
  │     compensatingActionPayload: { email_id: id }
  │   })
  │   return { result, audit_id }
  │ })()
  └→ return ToolExecutionResult
```

If `prepare` throws (Anthropic 5xx, parse failure, ownership violation), no DB write happens. If `execute` or `writeAuditRow` throws inside the transaction, both roll back atomically — no orphan email, no orphan audit row.

### E. Citation grounding inside `grade_clause_severity`

```
grade_clause_severity(clause_id)
  │ clause = loadOwnedLeaseFromClauseId(clause_id, ctx)
  │ retrieved = retrieve(clause.text, db, { workspaceId, maxResults: 4 })
  │ if retrieved is empty:
  │   if corpus is empty for workspace: throw "run npm run db:seed"
  │   else: throw "no chunks matched this clause"
  │
  │ response = anthropic.messages.create({
  │   model, max_tokens: 1024,
  │   messages: [{ role: 'user', content: GRADING_INSTRUCTION + clause + retrieved }]
  │ })
  │ parsed = JSON.parse(extractJsonBlock(response))   // { severity, statute_citation, chunk_id, ... }
  │
  │ // Validation — both checks throw if not satisfied
  │ cited = retrieved.find(c => c.chunkId === parsed.chunk_id)
  │ if !cited: throw "chunk_id was not in the retrieved set"
  │ if !cited.content.includes(parsed.statute_citation): throw "statute_citation not in chunk text"
  │
  └→ return { severity, statute_citation, chunk_id, reasoning, recommended_action, ... }
```

A failed citation throws and bubbles to the chat route as a `tool_result` error pill. The model can retry on the next turn or admit it cannot ground the claim — this is the §2.6 invariant from the Sprint 13 spec, and the Tier 1 eval enforces a ≥ 0.90 groundedness rate as a CI gate.

### F. Rollback path (`POST /api/audit/[id]/rollback`)

```
load audit row
  │ if status === 'rolled_back': return 200 (idempotent no-op)
  │ ownership check: Admin sees all; others must own the row
  │ load descriptor by tool_name; lookup compensatingAction
  │
  │ db.transaction(() => {
  │   compensatingAction(JSON.parse(compensating_action_json), context, db)
  │     // for draft_negotiation_email: DELETE FROM negotiation_emails WHERE id = ?
  │   markRolledBack(db, id)   // UPDATE audit_log SET status='rolled_back', rolled_back_at=now()
  │ })()
  │
  └→ return { audit_id, status: 'rolled_back' }
```

The compensating-action payload is plain JSON — the rollback path closes over no mutable state from the original call. `draft_negotiation_email` is the only mutating tool today; older payloads from removed tools (`schedule_content_item`, `approve_draft`) would still roll back if any audit rows linger from a pre-Sprint-13 dev DB, because the compensating-action handlers were retained behind the registry until the schema cleanup is finalised.

### G. Diagram tool render flow

`render_workflow_diagram` is read-only and produces no audit row. The descriptor strips leading whitespace + `%%{init:...}%%` directives + `%%` line comments, matches against an 8-keyword prefix regex (length ≤ 4000), and returns the validated source. Client-side, [`MermaidDiagram.tsx`](../../src/components/chat/MermaidDiagram.tsx) dynamic-imports `mermaid`, initializes once with `securityLevel: 'strict'` + `htmlLabels: false`, calls `mermaid.render(useId(), code)`, and injects the SVG via `dangerouslySetInnerHTML`. Parse errors fall back to a `<pre>` block with the raw code. First-paint fade+scale via Motion (350ms); reduced motion + mounted-state guard for SSR safety.

---

## 6. CSS architecture

Tailwind v4, import-only. [`src/app/globals.css`](../../src/app/globals.css) is the single CSS file:

```css
@import "tailwindcss";

@layer base {
  /* minimal resets, font defaults, theme tokens */
}
```

No `tailwind.config.js`. No external design-token JSON. All component styling is inline Tailwind utility classes in TSX. Icons are imported from `lucide-react`. The editorial brand tokens (cream/terracotta palette, ink-blue citation, Source Serif 4 weight 700) landed in the Sprint 23 series.

Sprint 28.13 dropped the "page must not scroll" invariant — the workspace is now a window-scrolled document with a sticky header (`min-h-screen` + `relative` on `<main>`). Mode B (`ParserResultsShell`) uses CSS grid for the two-column PDF / results layout; the FAB drawer is `position: fixed` anchored bottom-right. `prefers-reduced-motion` is honoured at every animation site via conditional render (not `transition: { duration: 0 }`).

---

## 7. Testing strategy

| Layer | Tool | Scope |
|---|---|---|
| Pure functions | Vitest | `chunk-document`, `bm25`, `parse-stream-line`, `context-window`, `scoring`, `parse-pdf`, `segment-clauses`, `classify-clause`, `validate-upload`, `embed` (mocked pipeline), `use-scan-progress`, `scan-lifecycle`, `grading`. |
| DB / queries | Vitest, in-memory SQLite | `db/schema`, `db/spend`, `db/rate-limit`, `workspaces/queries`, `workspaces/cleanup`, `cockpit/queries`, `lease/queries`. |
| Tool registry | Vitest | RBAC dispatch, mutating-vs-read paths, audit transaction wrapping, `prepare` step ordering. |
| Lease tools | Vitest | `extract_clauses`, `grade_clause_severity` (citation-grounding validators), `draft_negotiation_email` (prepare + transaction + rollback). |
| Route handlers | Vitest (`*.integration.test.ts`) | `POST /api/chat` streaming, `POST /api/leases` upload happy path + 422 no-text-layer, `GET /api/leases/[id]` ownership, `GET /api/audit`, `POST /api/audit/[id]/rollback`. |
| UI components | Vitest + happy-dom | `WorkspaceRouterShell`, `ParserLandingShell`, `ParserResultsShell`, `PdfViewer`, `RedFlagReport`, `ClausesList`, `AutoScanRunner`, `CitationChip`, `LeaseUploadDropzone`, `AssistantFab`, `ChatTranscript`, `ChatMessage`, `ToolCard`, `MermaidDiagram`, cockpit panels. |
| Context boundary | Vitest | [`ChatStreamContext.test.tsx`](../../src/components/chat/ChatStreamContext.test.tsx) pins the exposed-keys invariant — fails immediately if parser fields are re-added to `ChatStreamContext`. |
| Server pages | Vitest + happy-dom | `app/page.test.tsx`, `app/cockpit/page.test.tsx`. Asserts redirect, role gate, payload shape. |
| End-to-end | Playwright | `tests/e2e/*.spec.ts`. Real browser, real Next.js server, mocked Anthropic via `LEASELENS_E2E_MOCK=1`. |
| Tier 1 eval | Custom harness | `npm run eval:golden` runs 12 NJ tenant-law retrieval cases against the seeded corpus. Hermetic (no network). |
| Tier 2 eval | Custom harness | `npm run eval:leases` drives `grade_clause_severity` against 12 curated lease clauses; calls Anthropic. |
| MCP contract | Vitest | `mcp/leaselens-server.test.ts` — registry parity with chat route. |

Provider-aware UI tests use the shared `withChatStream` helper in [`src/components/chat/test-helpers.tsx`](../../src/components/chat/test-helpers.tsx), which wraps in all three providers in the pinned order. Direct mounts of `ChatStreamProvider` must also wrap with `LeaseParserProvider` + `AssistantFabProvider` if the component-under-test uses those hooks. `window.confirm` is not implemented in happy-dom — stub via `vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))`.

In-memory SQLite ([`src/lib/test/db.ts`](../../src/lib/test/db.ts)) is the standard test fixture. Real-DB tests are limited to `mcp/leaselens-server.test.ts` and `src/lib/tools/corpus-tools.test.ts`, which assume `./data/leaselens.db` is seeded.

---

## 8. Key design decisions

1. **NDJSON streaming over SSE.** Plain `ReadableStream` keeps the response a regular HTTP response that any fetch client can consume line by line. SSE adds framing rules the client doesn't need.

2. **Audit row in the same `db.transaction` as the mutation.** Atomic. If the audit-row insert fails, the mutation rolls back. No orphan mutations without trail.

3. **`prepare` step for async work outside the transaction.** `draft_negotiation_email` calls Anthropic in `prepare` *before* the SQLite transaction opens. `better-sqlite3` is synchronous and cannot await; running the LLM call inside the transaction would either be impossible or would block the WAL writer for seconds.

4. **Compensating-action payload is plain JSON, not a closure.** A rollback issued days later still works; nothing closes over the original request scope.

5. **Citation grounding is enforced inside the tool, not inside the prompt.** `grade_clause_severity` validates that the model's `chunk_id` is in the retrieved set and that `statute_citation` appears verbatim in that chunk's text. A prompt instruction to "cite a real statute" is necessary but not sufficient — the validator is the contract. Failed citation throws.

6. **Lease text never enters the RAG index.** `chunks` holds NJ tenant-law only. `leases` and `clauses` are session input. Retrieval grounds in statutes, not in the user's own document. This makes the corpus / lease boundary auditable — anything the model cites as "NJ law" came from the seeded corpus.

7. **Lease ownership is a separate axis from RBAC.** A Tenant *can* see the `extract_clauses` tool in their manifest, but `assertLeaseOwnership` rejects calls on leases the Tenant did not upload. Reviewer + Admin bypass the check. One helper, called by every lease tool and the route guard.

8. **Embeddings as BLOB on the row, not a separate vector index.** ~28 corpus documents, ~120 chunks; in-app dot-product is fast enough. No external vector DB to operate.

9. **Hybrid retrieval via RRF.** Vector catches semantic phrasing, BM25 catches statute-string matches ("46:8-21.2"). RRF merges ranks without tuning weights.

10. **`workspace_id` denormalized on every per-data table.** Fast index lookup, zero joins for the common workspace-filtered query.

11. **Workspace TTL is lazy.** `purgeExpiredWorkspaces` runs only on `POST /api/workspaces`. Eventual consistency is acceptable.

12. **Workspace cookie is a separate JWT from the session cookie.** Workspace and role are orthogonal concerns. A user can switch workspaces without rotating their role JWT.

13. **FK enforcement is locked at boot.** `db.pragma('foreign_keys = ON')` is explicit even though `better-sqlite3@12` defaults it on. Defensive against library default change.

14. **Demo-mode guardrails are server-side.** Rate limit + spend ceiling + model pin gated by `LEASELENS_DEMO_MODE`. Client cannot bypass.

15. **Tool registry is the single mutation entry point.** MCP server and chat route both call `toolRegistry.execute`. There is no second code path that mutates `negotiation_emails`, `audit_log`, or any other table.

16. **Tier 1 + Tier 2 evals run on different cadences.** Tier 1 is hermetic (no LLM calls) and cheap — safe to run on every PR. Tier 2 calls Anthropic and must be gated on the daily spend ceiling; today it's a manual `npm run eval:leases`.

17. **Diagrams render client-side, not server-side.** Inherited from Sprint 12. The `mermaid` bundle is dynamic-imported; the cost is paid only on first render.

18. **Motion is scoped and reduced-motion-respecting.** `MermaidDiagram` first-paint, `ChatMessage` assistant entry, `ToolCard` expand/collapse, theme-flip (Sprint 30, View Transitions API with double-rAF fallback). `useReducedMotion()` is honoured via *conditional render*, not via `transition: { duration: 0 }`. The `data-motion="on"|"off"` attribute is the test hook.

19. **Role labels vs role literals.** Charter v1.13 renamed Creator/Editor/Admin to Tenant/Reviewer/Admin in all UI and prompt surfaces, but the DB literals stay Creator/Editor/Admin so the schema, session JWT payload, and demo-user seed don't churn. [`auth/role-labels.ts`](../../src/lib/auth/role-labels.ts) is the only bridge.

20. **Disclaimer is a compile-time constant.** `LEASELENS_DISCLAIMER` in [`lease/disclaimer.ts`](../../src/lib/lease/disclaimer.ts) is imported by the home page, chat empty state, system prompt, and README so the wording cannot drift across surfaces. (§2.8 invariant from the Sprint 13 spec.)

21. **Parser-first, assistant-second.** (Sprint 26 pivot.) The PDF viewer + red flags + clauses list are the load-bearing UI; chat is a floating drawer that lazy-mounts on first open and stays mounted. State ownership is split across three contexts in a pinned order (`AssistantFabProvider` → `LeaseParserProvider` → `ChatStreamProvider`) so chat actions cannot accidentally clear parser state. "Clear assistant chat" resets the chat thread only — the lease, clauses, and red flags survive by construction.

---

## 9. Deployment shape

**Intended target:** Vercel. Local dev + demo is the primary surface today; no public deployment yet.

`next.config.ts` is Vercel-aware:
- `serverExternalPackages: ['better-sqlite3']` — keeps the native module on the Node runtime.
- `outputFileTracingIncludes: { '/*': ['./data/**/*'] }` — bundles the seeded DB into deployment artifacts.

**Environment variables** (see `.env.example`):

| Var | Purpose |
|---|---|
| `LEASELENS_DB_PATH` | Path to the SQLite file. Default `./data/leaselens.db`. |
| `LEASELENS_DEMO_MODE` | `true` engages rate limit + spend ceiling. Also gates the Cockpit link + RoleSwitcher. |
| `LEASELENS_ANTHROPIC_MODEL` | Model pin. Default `claude-haiku-4-5`. |
| `LEASELENS_DAILY_SPEND_CEILING_USD` | Default `2`. Demo only. |
| `LEASELENS_SESSION_SECRET` | ≥32-char HS256 secret. Used for both session and workspace cookies. |
| `LEASELENS_LEASE_MAX_BYTES` | Default `1048576` (1 MB). |
| `LEASELENS_LEASE_MAX_PAGES` | Default `30`. |
| `LEASELENS_AUTO_SCAN_ENABLED` | When `true`, `AutoScanRunner` fires the standard scan on fresh in-session uploads. |
| `ANTHROPIC_API_KEY` | Required for real API calls. Tier 2 eval and prod both need a real key. |
| `LEASELENS_E2E_MOCK` | When `1`, swaps in the deterministic Anthropic mock. Set by Playwright's `webServer.env`. |

All env vars are declared in [`src/lib/env.ts`](../../src/lib/env.ts) (Zod schema) and mirrored in `.env.example`.

**Build:**
- `npm run build` → `next build`. `predev` runs `copy-pdf-worker` + `seed-if-empty`.
- Tailwind v4 is processed by PostCSS via `@tailwindcss/postcss`.

**Runtime:**
- `npm run start` → `next start`.
- MCP server (`npm run mcp:server`) runs separately; not deployed with the web app today.

---

## 10. Known risks

1. **Vector-only retrieval can miss exact-statute citations.** RRF with BM25 mitigates partly, but for queries that should match a specific `46:8-21.2`-style citation, FTS5 would tighten the rank.

2. **Demo-mode guardrails apply only to the chat endpoint.** Rate limit and spend ceiling guard `POST /api/chat`. The lease-upload endpoint has the per-file size + page caps but no per-session rate limit; a flood of large PDFs could fill disk. Acceptable for an internal demo, not for an exposed public deploy.

3. **Auth is demo cookies, not real auth.** Three hardcoded users with stable IDs; the role switcher is cosmetic state in a JWT. If publicly exposed without a real auth layer, anyone can switch to Admin. The `LEASELENS_DEMO_MODE=false` mode hides the switcher and the Cockpit link, but does not introduce real auth.

4. **Single SQLite file with no backup automation.** A filesystem failure on the deploy target loses all workspaces, leases, and audit trail.

5. **Embedding model auto-downloads on first use.** Xenova's WASM pipeline fetches the model on first `embedBatch`. Cold-start serverless platforms can be slow on the first request after deploy.

6. **MCP server is hardcoded to the sample workspace.** Multi-workspace MCP is on the backlog.

7. **Scanned-PDF fallback is missing.** A scanned-image lease (no text layer) returns 422 with `error: 'pdf_no_text_layer'`. The paste-text fallback that closes the loop is on the backlog.

8. **Legacy `content_calendar` / `approvals` tables linger in the schema.** They carry no rows post-Sprint-13 but the DDL remains. A schema cleanup migration is not yet scheduled.

9. **`LeaseLensWorkspaceShell` lives on as dead code.** Only its colocated test imports it; the workspace is fully on `WorkspaceRouterShell` → `ParserLandingShell` / `ParserResultsShell`. Slated for removal — do not add new dependencies on it.

---

**End of architecture snapshot.**

This document is dated 2026-05-29 and pinned to the post-Sprint-33 codebase. Refresh discipline: update this file at every sprint boundary, in the same commit as the sprint's documentation amendments. If any section here drifts from the code, the code is the source of truth — fix the doc.
