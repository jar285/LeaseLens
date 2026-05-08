# Sprint 13 — LeaseLens Vertical Pivot + Demo Deployment + README + Loom

**Status:** Draft, awaiting human QA per charter §7 step 1.
**Date:** 2026-05-07.
**Charter version at draft time:** 1.13. The amendment that pivots the
project from ContentOps to LeaseLens landed in the same operator session
as this draft. Sprint 13 was reframed in v1.13 from "Demo Deployment +
README + Loom" to a vertical pivot (corpus + tools + UI swap) followed
by the deployment + README + Loom closeout. The two halves ship under
one sprint because the deployment is contingent on the new product
surface, not the old one.

---

## 1. Problem

ContentOps Sprints 0–12 shipped a media-brand-onboarding cockpit ("Side
Quest Syndicate") that exercises every charter §5 hard requirement
(streaming chat, RAG, tools, RBAC, audit, rollback, MCP, eval harness,
demo guardrails). The cockpit works, but the product framing reads as
generic to a hiring reviewer for AI Forward Deployed / AI Product
Engineer / Applied AI roles — "AI ops cockpit for fictional media
brand" does not differentiate against the dozens of other indie chat
demos.

A class-assignment portfolio reframe (resume gap analysis vs Doing
Things AI PE, Semgrep Staff AI PE, Distyl FDE, Regal AI Product
Specialist) confirmed three things. (1) The skills missing from the
operator's resume — LLM SDK integration, prompt engineering, agentic
tool use, RAG, evaluation frameworks — are already exercised by the
ContentOps codebase; what's missing is a story a reviewer cares about
in 30 seconds. (2) The infrastructure (registry, audit, RAG, eval) is
domain-agnostic and re-skins cleanly. (3) A serious-domain vertical
(NJ residential leases) reads as "the candidate respects citation
discipline and high-stakes outputs" in a way the media-brand framing
does not.

Sprint 13 swaps the corpus and tool surface from media brand → NJ
residential lease red-flag reviewer, while preserving every §4
invariant and §5 hard requirement. The deployment, README, and Loom
that the original Sprint 13 was meant to ship now ship with the new
product surface, not the old one.

The sprint also closes the Sprint-12 deferred deployment work: Vercel
deploy, README rewrite, eval results published at `/cockpit/evals`,
and a 90-second Loom demo of the lease workflow.

Out-of-scope items are enumerated in §7. Charter §6 (simplicity meta-
rule) governs: no pattern that is not called for here is permitted in
this sprint.

---

## 2. Invariants

These hold regardless of implementation choices below.

1. **Charter §4 architectural invariant.** The three new tools
   (`extract_clauses`, `grade_clause_severity`,
   `draft_negotiation_email`) are registered in the same `ToolRegistry`
   that drives prompt-visible schemas and runtime execution. A
   reviewer cannot find a tool advertised to the model without it also
   being executable by the same RBAC, or vice versa. The MCP server
   exposes the same registry over stdio.
2. **Corpus vs lease distinction (charter §5.12).** The NJ tenant-law
   corpus is the only thing in `documents` / `chunks`. Lease PDFs
   uploaded by reviewers are session-scoped *input*, stored in new
   `leases` and `clauses` tables, and **never** embedded into the RAG
   index. `retrieve.ts` is unchanged; it queries the corpus only.
3. **RBAC (charter §5.6 v1.13).** Three roles — Tenant, Reviewer,
   Admin — enforced at the `ToolRegistry`'s `getToolsForRole` filter
   and re-checked at `execute` time. Database-level role identifiers
   remain the legacy `Creator|Editor|Admin` literals so this sprint
   does not rewrite the schema, the session cookie payload, or the
   demo-user seed. The mapping is fixed:

   | Charter v1.13 (UI / prompt / docs) | DB-level (`users.role`, RBAC checks) |
   |---|---|
   | Tenant | `Creator` |
   | Reviewer | `Editor` |
   | Admin | `Admin` |

   Every code surface that displays the role to a human (system
   prompt, role switcher, cockpit header, tool descriptors) renders the
   left-column name. Every code surface that compares the role to a
   string literal (registry filter, route guards) reads the right-
   column literal. A single mapping helper in
   `src/lib/auth/role-labels.ts` (new) is the only place the two are
   bridged.
4. **Mutating tool atomicity.** `draft_negotiation_email` is the
   single new mutating tool. It writes a `negotiation_emails` row and
   an `audit_log` row inside one `db.transaction(() => {...})()` per
   the existing `ToolRegistry.execute` contract. The compensating
   action is `DELETE FROM negotiation_emails WHERE id = ?` keyed by
   the JSON payload `{ email_id }`. Both the existing
   `schedule_content_item` and `approve_draft` mutating tools are
   removed from the registry; their compensating actions, audit-row
   patterns, and test fixtures are deleted with them.
5. **Demo-mode guardrails (charter §11b) preserved verbatim.**
   `CONTENTOPS_DEMO_MODE`, the 10-req/hour rate limit, the daily
   spend ceiling, the model pin (`claude-haiku-4-5` default), and the
   read-only-corpus rule all carry over with no behavior change. Lease
   upload is a *session input* path, not a corpus modification path,
   so it is permitted on the deployed demo subject to the existing
   rate limit; a per-session lease size cap of 1 MB and 30 pages is
   added in §3c.
6. **Citation groundedness.** Every severity grading produced by
   `grade_clause_severity` MUST cite a `chunk_id` from the live NJ
   tenant-law corpus, AND the tool's human-readable
   `statute_citation` MUST appear (case-insensitive, whitespace-
   collapsed) as a substring of the cited chunk's text. Both checks
   run inside the tool before it returns. A grading that fails
   either check throws and surfaces in the UI as an error pill —
   the LLM must retry or admit it cannot ground the claim. This
   invariant is testable in CI: the lease-grading eval (§3i)
   computes a groundedness rate and fails the run if it drops
   below 0.90.
7. **Single jurisdiction.** NJ-only. The seed corpus is NJ statutes
   and NJ-specific tenant-rights references (§3d). Adding additional
   states is a charter amendment, not a sprint-13 task. The system
   prompt explicitly limits the model to NJ residential leases and
   instructs it to refuse if a lease appears to be from another
   jurisdiction or to be a commercial lease.
8. **No legal advice.** The home page, the chat empty state, the
   system prompt, and the README all carry an explicit "this is not
   legal advice" disclaimer with a recommendation to consult a
   tenant attorney or NJ legal-aid clinic. The disclaimer is a
   compile-time constant in `src/lib/lease/disclaimer.ts` (new) so
   that all four surfaces render the same string.
9. **PDF ingestion is text-layer-only.** Scanned-image PDFs (no text
   layer detectable) surface a clear error and a paste-text fallback
   input. OCR is out of scope per charter v1.13 §11a.
10. **Out-of-scope per charter v1.13 §11a.** Multi-jurisdiction
    support, OCR fallback, real outbound SMTP/Mailgun email delivery.
    The sprint must not introduce any of these. The
    `draft_negotiation_email` tool produces a JSON artifact in the
    audit trail; nothing is sent over the wire.
11. **Codebase rename scope.** This sprint renames the package
    (`contentop` → `leaselens`), the npm `mcp:server` script target
    (`mcp/contentops-server.ts` → `mcp/leaselens-server.ts`), the DB
    path default (`./data/contentops.db` → `./data/leaselens.db`),
    and the env-var prefix (`CONTENTOPS_*` → `LEASELENS_*`) atomically.
    Every code surface that reads an env var, opens the DB, or
    references the MCP server path is updated in the same commit. A
    Vercel-side env-var rename is a deployment task, not a code task,
    and the sprint plan calls it out in the verification flow.
12. **Tenant ownership of leases (charter §5.6 v1.13).** The Tenant
    role (DB literal `Creator`) may read and act on **only** leases
    whose `leases.uploaded_by === ctx.userId`. Reviewer (`Editor`)
    and Admin (`Admin`) read all leases in the workspace. The check
    is enforced inside three places: (a) `extract_clauses` and
    `grade_clause_severity` (read paths), (b) `draft_negotiation_email`
    (write path), (c) `GET /api/leases/[id]` (route guard). A single
    helper `assertLeaseOwnership(lease, ctx)` is the only place the
    rule is encoded; tools and the route call it before any other
    work.

---

## 3. Architecture

### 3a. Library choices

| Library | Version | Role | Justification |
|---|---|---|---|
| `pdfjs-dist` | latest 4.x at sprint-plan time | Server-side PDF text extraction; client-side `react-pdf` engine | Single PDF library used by both the upload route (server) and the viewer (client). Avoids carrying two parsers. The legacy `pdf-parse` wrapper is unmaintained and pinned to an old `pdfjs` — declined. |
| `react-pdf` | latest 10.x at sprint-plan time | Client-side PDF viewer in the left pane | React wrapper around `pdfjs-dist`. Renders pages on `<canvas>`, supports `page` and `scale` props, exposes a `pageRef` API for scroll-to-page when a citation chip is clicked. |

Both must be verified via Context7 (charter §15a) before the sprint
plan names their APIs. The sprint plan author records the verified
versions in `sprint.md` and pins them in `package.json`.

No other new runtime dependencies. Everything else (Anthropic SDK,
Mermaid, Motion, Zod, jose, better-sqlite3, Xenova transformers,
Tailwind) is already installed.

Removed runtime dependencies: none. The existing six tools are reduced
to four (the two mutating ContentOps tools are removed) but no
package-level dep is dropped — `@modelcontextprotocol/sdk` continues
to back the renamed MCP server.

### 3b. Tool surface

The `ToolRegistry` after Sprint 13 holds **seven** tools (was eight in
Sprint 12). The two ContentOps mutating tools are removed; three
LeaseLens tools are added. Every retained tool gets a description
update so the model understands it operates on NJ tenant law and lease
PDFs, not media brand corpora.

| Tool | Status | Roles | Mutating | Category |
|---|---|---|---|---|
| `search_corpus` | retained, description rewritten for NJ tenant law | ALL | no | `corpus` |
| `get_document_summary` | retained, description rewritten for NJ statutes | ALL | no | `corpus` |
| `list_documents` | retained, description rewritten for the NJ corpus | Admin | no | `corpus` |
| `render_workflow_diagram` | retained as-is | ALL | no | `visualization` |
| `extract_clauses` | new | ALL | no | `lease` (new `ToolCategory`) |
| `grade_clause_severity` | new | ALL | no | `lease` |
| `draft_negotiation_email` | new | Tenant, Reviewer, Admin | yes | `lease` |
| `schedule_content_item` | **removed** | — | — | — |
| `approve_draft` | **removed** | — | — | — |

Tool input/output shapes:

#### `extract_clauses`

Returns the clause list for the conversation's `active_lease_id`. The
upload route (§3c) pre-extracts clauses; this tool is a read-back so
the model can decide which clauses to grade.

```jsonc
// input
{
  "type": "object",
  "properties": {
    "lease_id": {
      "type": "string",
      "description": "Optional lease id. When omitted, defaults to the conversation's active_lease_id. Throws if neither is set."
    }
  }
}

// result
{
  "lease_id": "<uuid>",
  "page_count": 14,
  "clauses": [
    {
      "clause_id": "<uuid>",
      "clause_index": 0,
      "clause_type": "security_deposit" | "late_fee" | "early_termination" | ... | "unknown",
      "text": "<clause text, truncated to 1200 chars in the result envelope>",
      "page_number": 3
    },
    // ...
  ]
}
```

#### `grade_clause_severity`

Runs `retrieve()` against the NJ tenant-law corpus using the clause
text as the query, asks the model (in a single non-streaming
`messages.create` call) to grade severity and cite the most relevant
chunk, validates the citation against the live corpus, and returns
the result.

```jsonc
// input
{
  "type": "object",
  "properties": {
    "clause_id": { "type": "string" }
  },
  "required": ["clause_id"]
}

// result
{
  "clause_id": "<uuid>",
  "severity": "high" | "medium" | "low" | "ok",
  "statute_citation": "NJ Stat 46:8-21.1",  // human-readable
  "chunk_id": "<the live chunk_id supporting the citation>",
  "reasoning": "<200-400 char explanation>",
  "recommended_action": "<short next step the tenant could take>"
}
```

The chunk-id validation is the §2.6 invariant.

#### `draft_negotiation_email` (mutating)

```jsonc
// input
{
  "type": "object",
  "properties": {
    "clause_id": { "type": "string" },
    "tone":      { "type": "string", "enum": ["polite", "firm", "formal"] }
  },
  "required": ["clause_id"]
}

// MutationOutcome.result
{
  "email_id": "<uuid>",
  "clause_id": "<uuid>",
  "tone": "polite",
  "subject": "<line>",
  "body":    "<email body, 200-600 words>"
}

// compensatingActionPayload
{ "email_id": "<uuid>" }
```

Compensating action: `DELETE FROM negotiation_emails WHERE id = ?`.
Idempotent (same shape as `schedule_content_item`'s rollback).

### 3c. PDF ingestion pipeline

New route `POST /api/leases` at `src/app/api/leases/route.ts`
(filename mirrors the existing `/api/workspaces` route handler).
Multipart form data: one `file` field, content type
`application/pdf`, max 1 MB, max 30 pages. Stricter than the
charter's 100KB markdown cap because PDFs are heavier; weaker than
opening the door to OCR-required scans. Validation is in
`src/lib/lease/validate-upload.ts` (new) — a pure function that
returns `{ ok: true, file } | { ok: false, error }`.

On valid input the route runs (in this order):

1. `parsePdf(buffer)` from `src/lib/lease/parse-pdf.ts` (new) returns
   `{ pageCount, pages: { pageNumber, text }[] }` using `pdfjs-dist`.
   On a text-layer-empty PDF (every page returns ≤
   `MIN_PAGE_TEXT_CHARS` chars; the constant is 30 today, exported
   from `parse-pdf.ts` so it can be tuned without spec edits), the
   route returns 422 with `error: 'pdf_no_text_layer'` and the UI
   displays a paste-text fallback (§3f). Partial text-layer PDFs
   (some pages empty, others not) succeed and produce clauses only
   from text-bearing pages.
2. `segmentClauses(pages)` from `src/lib/lease/segment-clauses.ts`
   (new) returns `{ clauseIndex, clauseType, text, pageNumber }[]`.
   Naive segmentation: split on numbered-section regex
   `/^\s*(\d+\.|\([a-z]\)|ARTICLE [IVX]+)/m`, then a small
   keyword-match `clauseType` classifier (security deposit, late fee,
   early termination, sublet, repair, entry, retaliation,
   automatic renewal, attorney's fees, indemnification, jury waiver,
   pet, parking — 13 known types, anything else is `'unknown'`).
   Classifier lives in `src/lib/lease/classify-clause.ts` (new) and
   is unit-tested with planted samples. **Zero-clause case:** if
   `segmentClauses` returns `[]` (PDF has text but no recognizable
   numbered sections), the upload still succeeds — the lease row is
   inserted, `clause_count: 0` returns to the client, and the chat
   empty state surfaces a one-line warning that auto-detection
   failed and offers the paste-text fallback.
3. `db.transaction(() => { ... })()`:
   - INSERT into `leases` (`id`, `workspace_id`, `filename`,
     `text_extract`, `page_count`, `uploaded_by`, `created_at`)
   - INSERT each clause into `clauses` (`id`, `lease_id`,
     `workspace_id`, `clause_index`, `clause_type`, `text`,
     `page_number`, `created_at`). Skipped when `clauses.length === 0`.
4. UPDATE the conversation's `active_lease_id` (§3e schema change)
   so subsequent chat turns operate on the new lease.
5. Return `{ lease_id, page_count, clause_count }`.

Lease deletion is folded into the existing
`purgeExpiredWorkspaces` cascade in `src/lib/workspaces/cleanup.ts`
(no separate `purgeExpiredLeases`). The existing lazy-cleanup hook
fires from `POST /api/workspaces` AND, new in this sprint, from
`POST /api/leases`. The cascade order in §3e shows the new tables
inserted before the existing `chunks` step.

### 3d. NJ tenant-law seed corpus

Stored at `src/corpus/nj-tenant-law/*.md` (replaces the existing
`src/corpus/*.md` Side Quest Syndicate files, which are deleted in
this sprint). 40–60 markdown files, one per logical statute section
or topic, ingested into the sample workspace at seed time via the
existing `ingestCorpus` path.

Source authority and access discipline:

| Source | Use | Citation format |
|---|---|---|
| NJ Truth-in-Renting Act (P.L. 1980, c. 233) — official NJ.gov PDF | Required core | `NJ Truth-in-Renting §<n>` |
| NJ Stat 46:8 (Landlord and Tenant) | Required core for security deposit, late fees, retaliation | `NJ Stat 46:8-<n>` |
| NJ Stat 2A:18 (summary dispossess) | Selected sections relevant to early termination | `NJ Stat 2A:18-<n>` |
| NOLO NJ tenant-rights pages (publicly available) | Plain-language references; cite as secondary | `NOLO NJ — <topic>` |
| Eviction Lab / EFF tenant guides | Optional supplemental | `EFF Tenant Guide — <topic>` |

URLs and access dates are recorded in a new file
`docs/_meta/corpus-sources.md` (created in this sprint). The
`docs/_references/` directory is left strictly read-only per its own
README rule, which has no append-only carve-out. Charter §1 bullet
3 still requires reading `docs/_references/README.md` at session
start, but writing to that tree is forbidden.

The 12–15 issue families the corpus must cover:

1. Security deposit (statutory cap = 1.5 months rent, 30-day return)
2. Late fees (cap, grace period, statutory limits)
3. Early termination penalties
4. Subletting clauses
5. Repair-and-deduct, habitability, warranty
6. Landlord entry (notice requirements)
7. Retaliatory eviction
8. Automatic renewal
9. Attorney's fees clauses (one-way vs reciprocal)
10. Indemnification / liability waivers
11. Jury-trial waivers
12. Pet clauses, fees, weight limits
13. Parking, storage, common-area fees

Each issue gets one or more files. The `extract_clauses` classifier
(§3c) and the lease-grading eval (§3i) reference the same enum.

A single seeded sample lease ships at
`src/corpus/sample-lease/sample-nj-residential-lease.pdf`. It is a
hand-crafted NJ residential lease with planted issues from the 13
families above. The lease is deterministic; the eval golden set
references its `lease_id` after seed.

### 3e. Schema changes

Three new tables and one column add. Migration is idempotent and
lands in `src/lib/db/migrate.ts` per the existing pattern (boot-time
patch, no down migration needed).

```sql
-- New: leases (workspace-scoped, session input)
CREATE TABLE IF NOT EXISTS leases (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL,
  filename        TEXT NOT NULL,
  text_extract    TEXT NOT NULL,
  page_count      INTEGER NOT NULL,
  uploaded_by     TEXT NOT NULL,           -- users.id
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leases_workspace ON leases(workspace_id);

-- New: clauses (workspace-scoped, child of leases)
CREATE TABLE IF NOT EXISTS clauses (
  id              TEXT PRIMARY KEY,
  lease_id        TEXT NOT NULL REFERENCES leases(id),
  workspace_id    TEXT NOT NULL,
  clause_index    INTEGER NOT NULL,
  clause_type     TEXT NOT NULL,           -- enum string, see §3c
  text            TEXT NOT NULL,
  page_number     INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clauses_lease ON clauses(lease_id);
CREATE INDEX IF NOT EXISTS idx_clauses_workspace ON clauses(workspace_id);

-- New: negotiation_emails (workspace-scoped, mutating-tool target)
CREATE TABLE IF NOT EXISTS negotiation_emails (
  id              TEXT PRIMARY KEY,
  clause_id       TEXT NOT NULL REFERENCES clauses(id),
  workspace_id    TEXT NOT NULL,
  tone            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body            TEXT NOT NULL,
  drafted_by      TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_negotiation_emails_workspace ON negotiation_emails(workspace_id);

-- Modified: conversations gets active_lease_id (nullable)
ALTER TABLE conversations ADD COLUMN active_lease_id TEXT;
-- Idempotency: migrate.ts checks PRAGMA table_info before adding.
```

The `purgeExpiredWorkspaces` cascade order in
`src/lib/workspaces/cleanup.ts` is extended to delete in this exact
order (children first, parent last, all inside one
`db.transaction()` per the existing pattern):

```
negotiation_emails → clauses → leases →
chunks → audit_log → content_calendar → approvals → documents →
messages → conversations → workspaces
```

The two ContentOps-era tables (`content_calendar`, `approvals`) stay
in the cascade because dev DBs from prior sprints may have rows; the
tables themselves are not dropped in this sprint (charter §6
simplicity — drop is a separate sprint when there's a reason).

### 3f. Three-pane UI

`src/app/page.tsx` rebuilds into a three-column flex layout. The
columns are server-rendered shells; client islands hydrate inside
each.

```
 ┌────────────────────────────────────────────────────────────────────┐
 │  Header: LeaseLens · workspace · role switcher · upload-lease btn  │
 ├──────────────────┬─────────────────────────┬───────────────────────┤
 │                  │                         │                       │
 │   PDF Viewer     │     Chat Surface        │   Red-Flag Report     │
 │   (left)         │     (middle, existing   │   (right)             │
 │   react-pdf      │      ChatUI)            │   streams from chat   │
 │                  │                         │                       │
 │   page nav       │   composer at bottom    │   citation chips      │
 │   scroll-to-page │   ToolCard renders      │   click chip → PDF    │
 │   on chip click  │   inline as today       │   scrolls to page     │
 │                  │                         │                       │
 └──────────────────┴─────────────────────────┴───────────────────────┘
```

Empty state (no lease uploaded yet):

- Left pane: a "Drop your NJ lease PDF" drop zone (`react-pdf` is
  not loaded until a lease arrives).
- Middle pane: the existing `ChatEmptyState`, copy rewritten for
  LeaseLens, plus a button to load the seeded sample lease.
- Right pane: a placeholder card with the workflow steps:
  *Upload → Extract → Grade → Negotiate*.

Loaded state (lease uploaded, no chat messages yet):

- Left pane: `<PdfViewer pdfUrl={…} ref={pdfViewerRef} />` — client-
  only, dynamic-imports `react-pdf` to keep `pdfjs-dist` out of the
  SSR bundle. Exposes a `scrollToPage(n)` imperative handle via
  React 19's `useImperativeHandle`. The PDF binary is held in
  in-flight memory only — see §9 for the lose-on-refresh limitation.
- Middle pane: a new `<LeaseScanCTA leaseId={…} pageCount={…} />`
  component replaces `ChatEmptyState` when `active_lease_id` is set
  and the conversation has zero messages. Copy: "Want me to scan
  this {pageCount}-page lease? I'll extract clauses, grade each
  against NJ tenant law, and draft negotiation emails for any red
  flags." Single button: "Run the standard scan" — clicking it
  posts the message on the user's behalf, which trips the existing
  rate-limit / spend-ceiling guards as a deliberate user action.
- Right pane: same workflow placeholder as the empty state.

Loaded state (chat in progress):

- Left pane: as above.
- Middle pane: existing `ChatUI` with the conversation that has
  `active_lease_id` set. The system prompt now reflects the active
  lease (§3h).
- Right pane: `<RedFlagReport />` — reads tool events from a new
  `<ChatStreamContext.Provider>` that wraps the three-pane shell.
  ChatUI is the **single** NDJSON stream reader; while parsing it
  also pushes events into the context's `toolEvents` state.
  RedFlagReport `useContext`s the same and filters by tool name
  (`extract_clauses`, `grade_clause_severity`,
  `draft_negotiation_email`). Each red-flag item is a
  `<RedFlagCard>` with a `<CitationChip>`; clicking the chip calls
  `pdfViewerRef.current.scrollToPage(clause.page_number)` via a
  React 19 ref forwarded through the same context.

Below 1024px the three panes stack via the Tailwind default
flex-wrap behavior — incidental, not designed. The demo target is
desktop side-by-side; mobile polish is explicitly out of scope (§7).

A new component `src/components/lease/CitationChip.tsx` is the
shared chip primitive used by both the report and (when relevant)
inline citations in chat messages. The chip is a `<button>` carrying
`page_number` and `chunk_id` props; click handler is wired by the
parent — the chip itself is presentation-only.

The Mermaid `render_workflow_diagram` tool is repurposed to two
LeaseLens shapes:

1. **Clause dependency map** — flowchart showing how clauses reference
   each other (e.g. *Late Fee → triggers → Default → triggers →
   Acceleration*). The model is prompted to emit one when the user
   asks "show me how these clauses interact."
2. **Severity heatmap** — flowchart with color-coded nodes (red for
   high, yellow for medium, green for ok) keyed off the latest
   grading results. Emitted once after a full scan completes.

The system prompt teaches the model these two shapes (§3h). The tool
itself is unchanged.

### 3g. RBAC role mapping

Per §2.3 above, the v1.13 charter renames the three roles at the UI
and prompt level but keeps the DB-level literals. The bridge lives in
one new file:

```ts
// src/lib/auth/role-labels.ts
import type { Role } from './types';

export const ROLE_LABELS: Record<Role, string> = {
  Creator: 'Tenant',
  Editor: 'Reviewer',
  Admin: 'Admin',
};

export function labelFor(role: Role): string {
  return ROLE_LABELS[role];
}
```

Every UI surface that displays a role to a human imports `labelFor`.
Every code surface that compares to a role literal continues to use
the existing `Role` union (`'Creator' | 'Editor' | 'Admin'`). No
schema rewrite, no cookie-payload rewrite, no demo-user re-seed.

The `RoleSwitcher` toggle and the cockpit header read the labels via
`labelFor(currentRole)`. The system prompt reads `labelFor(role)` and
addresses the model accordingly: "You are assisting a Tenant…",
"You are assisting a Reviewer (legal-aid clinic persona)…",
"You are assisting an Admin…".

**Multi-tenant lease visibility within a workspace.** Reviewers and
Admins see all leases uploaded to the active workspace. Tenants see
only leases where `leases.uploaded_by === ctx.userId`. This matches
the legal-aid clinic persona for the Reviewer role and the §2.12
ownership invariant.

### 3h. System prompt

`src/lib/chat/system-prompt.ts` is parameterized on the existing
`{ role, workspace, context }` shape plus a new optional
`activeLease: { id, filename, page_count } | undefined`. The
ContentOps-era prose is replaced wholesale; the parameterization
contract and the role-aware/workspace-aware structure are unchanged.

The new prompt has these sections (numbered in the prompt itself, per
the Studio-Ordo-borrowed priority-ordered prompt-composition pattern
cited in `docs/_references/README.md`):

1. **Identity.** "You are LeaseLens, an AI assistant that reviews
   New Jersey residential lease PDFs and grades clauses against NJ
   tenant law. You are not a lawyer and your output is not legal
   advice; instruct the user to consult a tenant attorney or a NJ
   legal-aid clinic before taking any action based on your grading."
2. **Active workspace + role.** As before; uses `labelFor(role)`.
3. **Active lease.** Conditional on `activeLease`. Includes filename
   and page count. Otherwise, the model is instructed to ask the user
   to upload a lease.
4. **Tool manifest.** The role-filtered registry view (this is the
   §4 invariant — same source as `getToolsForRole(role)`).
5. **Workflow.** When the user asks to scan a lease: call
   `extract_clauses` first, then call `grade_clause_severity` for
   each clause whose type is not `'unknown'`, then optionally
   `render_workflow_diagram` to draw a severity heatmap. The model is
   instructed to stream the gradings (one tool call per clause)
   rather than batching, so the right-pane report fills in
   progressively. The chat route's `MAX_TOOL_ITERATIONS` is bumped
   from `3` to `15` to support up to 14 grading calls plus an
   `extract_clauses` call in a single user turn — the daily
   spend ceiling (charter §11b) remains the cost guard.
6. **Citation discipline.** Every severity claim must come from a
   `grade_clause_severity` result. The model must not invent statute
   numbers or paraphrase corpus content into a citation.
7. **NJ-only refusal.** If the lease appears to be from another
   state or is a commercial lease, refuse with a one-sentence
   explanation and recommend uploading a NJ residential lease.
8. **Disclaimer reminder.** End every assistant message that grades
   a clause with a one-sentence reminder pointing to the disclaimer
   in the UI.

The prompt is asserted by `system-prompt.test.ts` for: identity
sentence presence, disclaimer presence, tool manifest exact match
against `registry.getToolsForRole(role)`, role-label conformance,
and active-lease branch (with and without `activeLease` set).

**Lease-id resolution helper.** Tools that operate on a lease take
`lease_id` as an *optional* JSON-Schema field; the runtime resolves
it via a single helper `resolveLeaseId(input, ctx)` in
`src/lib/lease/resolve-lease-id.ts` (new):

1. If `input.lease_id` is set, validate it belongs to `ctx.workspaceId`
   and return it.
2. Else if `ctx.conversationId` is set, look up
   `conversations.active_lease_id` and (if present) return it after
   the same workspace check.
3. Else throw with a message naming the two ways the caller may
   provide the id.

This contract lets the chat route (which always has a
`conversationId`) call the tools with no `lease_id` arg, while MCP
callers (which have no conversation context — see
`mcp/leaselens-server.ts` synthetic id) must pass `lease_id`
explicitly or get a clear error.

### 3i. Eval harness extension (two tiers)

The Sprint-6 retrieval eval is extended with a second tier so cost
stays bounded.

**Tier 1 — retrieval golden set (cheap, runs in CI on every PR).**

`src/lib/evals/golden-set.ts` is replaced. New 12-case set targets
the NJ tenant-law corpus. Same `GoldenCase` shape as today
(`{ id, query, expectedChunkIds, expectedKeywords, k }`). Coverage
mirrors the 13 issue families from §3d (one query per family, plus
two cross-cutting queries on retaliation and habitability).
`runner.ts` is unchanged. `scripts/eval-golden.ts` is unchanged
beyond the file rename described in §2.11. `npm run eval:golden` is
the verification command.

**Tier 2 — lease-grading eval (expensive, runs on demand).**

New runner at `src/lib/evals/lease-grading-runner.ts`. New case
shape:

```ts
// src/lib/evals/lease-cases.ts
export interface LeaseGradingCase {
  id: string;
  leaseId: string;            // seeded lease in the sample workspace
  expectedRedFlags: {
    clauseType: ClauseType;
    severity: 'high' | 'medium' | 'low' | 'ok';
    statuteCitationPrefix: string;  // e.g. 'NJ Stat 46:8-21'
  }[];
}
```

The runner loads each labeled lease, calls the chat route under
`CONTENTOPS_E2E_MOCK=0` (so real Anthropic calls run), captures the
sequence of tool calls and results, and scores:

| Dimension | Metric | Pass threshold |
|---|---|---|
| Tool selection | First tool called == `extract_clauses` | 1.0 |
| Red-flag precision | TP / (TP + FP) over expected `(clauseType, severity)` pairs | ≥ 0.80 |
| Red-flag recall | TP / (TP + FN) over expected pairs | ≥ 0.75 |
| Citation groundedness | Fraction of gradings whose `chunk_id` is live in the corpus | ≥ 0.90 |
| Cost | Total Anthropic spend per case | reported, not gated |
| Latency | Wall-clock per case | reported, not gated |

A new CLI script `scripts/eval-leases.ts` mirrors
`scripts/eval-golden.ts`. New npm script: `eval:leases`.

12 labeled cases for the v1 lease-grading eval (the spec says "25" in
the v1.13 charter §16; the spec author trims to **12 in v1, 25 in a
follow-up sprint** because each case costs roughly $0.08–0.15 at
Haiku 4.5 prices and 25 cases would routinely exceed the demo-mode
$2 daily ceiling). Operator can override via the v1.13 changelog
amendment if 25 is required for the portfolio framing.

Both eval tiers write JSON reports to `data/eval-reports/` (gitignored).
The cockpit `EvalHealthPanel.tsx` is extended to show both tiers'
latest results side by side. The CI workflow (sprint-plan-decides)
runs Tier 1 on every PR; Tier 2 runs on `[lease-eval]` commit-message
trigger or `workflow_dispatch`.

### 3j. File layout

| Action | File |
|---|---|
| New | `src/lib/lease/parse-pdf.ts` — `pdfjs-dist` wrapper, returns `{ pageCount, pages }` |
| New | `src/lib/lease/parse-pdf.test.ts` |
| New | `src/lib/lease/segment-clauses.ts` — split + classify pipeline |
| New | `src/lib/lease/segment-clauses.test.ts` |
| New | `src/lib/lease/classify-clause.ts` — keyword-match clause-type classifier |
| New | `src/lib/lease/classify-clause.test.ts` |
| New | `src/lib/lease/validate-upload.ts` — multipart validation pure fn |
| New | `src/lib/lease/validate-upload.test.ts` |
| New | `src/lib/lease/queries.ts` — `getLease`, `listClauses`, `insertLease`, `insertClause`, `getActiveLease` |
| New | `src/lib/lease/queries.test.ts` |
| New | `src/lib/lease/disclaimer.ts` — `LEASELENS_DISCLAIMER` constant |
| New | `src/lib/lease/resolve-lease-id.ts` — `resolveLeaseId(input, ctx)` per §3h |
| New | `src/lib/lease/resolve-lease-id.test.ts` |
| New | `src/lib/lease/assert-lease-ownership.ts` — `assertLeaseOwnership(lease, ctx)` per §2.12 |
| New | `src/lib/lease/assert-lease-ownership.test.ts` |
| New | `src/lib/auth/role-labels.ts` — `labelFor(role)` mapping |
| New | `src/lib/auth/role-labels.test.ts` |
| New | `src/lib/tools/lease-tools.ts` — three new tools |
| New | `src/lib/tools/lease-tools.test.ts` |
| New | `src/lib/evals/lease-cases.ts` — 12 labeled cases |
| New | `src/lib/evals/lease-grading-runner.ts` |
| New | `src/lib/evals/lease-grading-runner.test.ts` (uses `e2e-mock` for the chat route) |
| New | `src/components/lease/PdfViewer.tsx` |
| New | `src/components/lease/PdfViewer.test.tsx` |
| New | `src/components/lease/RedFlagReport.tsx` |
| New | `src/components/lease/RedFlagReport.test.tsx` |
| New | `src/components/lease/CitationChip.tsx` |
| New | `src/components/lease/CitationChip.test.tsx` |
| New | `src/components/lease/LeaseUploadDropzone.tsx` |
| New | `src/components/lease/LeaseUploadDropzone.test.tsx` |
| New | `src/components/lease/LeaseScanCTA.tsx` — empty-state replacement when `active_lease_id` set per §3f |
| New | `src/components/lease/LeaseScanCTA.test.tsx` |
| New | `src/components/chat/ChatStreamContext.tsx` — `toolEvents` + `pdfViewerRef` shared state per §3f |
| New | `src/components/chat/ChatStreamContext.test.tsx` |
| New | `docs/_meta/corpus-sources.md` — NJ tenant-law corpus provenance per §3d |
| New | `src/app/api/leases/route.ts` — POST upload |
| New | `src/app/api/leases/route.test.ts` (or `.integration.test.ts`) |
| New | `src/app/api/leases/[id]/route.ts` — GET lease + clauses |
| New | `scripts/eval-leases.ts` — CLI for Tier 2 eval |
| New | `src/corpus/nj-tenant-law/*.md` — 40-60 seed files |
| New | `src/corpus/sample-lease/sample-nj-residential-lease.pdf` |
| Renamed | `mcp/contentops-server.ts` → `mcp/leaselens-server.ts` |
| Modified | `package.json` — name → `leaselens`, scripts updated, deps add `pdfjs-dist`, `react-pdf` |
| Modified | `src/lib/db/schema.ts` — add three tables + `active_lease_id` column |
| Modified | `src/lib/db/migrate.ts` — idempotent migrations for §3e |
| Modified | `src/lib/db/index.ts` — DB path env var rename |
| Modified | `src/lib/env.ts` — env-var prefix rename + 2 new vars (`LEASELENS_LEASE_MAX_BYTES` default 1048576, `LEASELENS_LEASE_MAX_PAGES` default 30) |
| Modified | `src/app/api/chat/route.ts` — bump `MAX_TOOL_ITERATIONS` 3 → 15 (§3h), pass `activeLease` into `buildSystemPrompt`, update `SPEND_CEILING_MESSAGE` GitHub URL to the renamed repo |
| Modified | `src/app/api/chat/route.test.ts` — assert iteration cap, activeLease forwarding |
| Modified | `src/lib/anthropic/e2e-mock.ts` — deterministic mocks for `extract_clauses`, `grade_clause_severity`, `draft_negotiation_email`; remove mocks for `schedule_content_item` and `approve_draft` |
| Modified | `playwright.config.ts` — `webServer.env` `CONTENTOPS_E2E_MOCK` → `LEASELENS_E2E_MOCK` |
| Modified | `tests/e2e/*.spec.ts` — env-var rename in any reference; new lease-flow E2E spec is sprint-plan-decides |
| Modified | `src/lib/tools/domain.ts` — `ToolCategory` adds `'lease'` |
| Modified | `src/lib/tools/create-registry.ts` — register 3 new tools, deregister `schedule_content_item`, `approve_draft` |
| Modified | `src/lib/tools/corpus-tools.ts` — descriptions rewritten (NJ tenant law, not media brand) |
| Modified | `src/lib/chat/system-prompt.ts` — full prose replacement, `activeLease` parameter |
| Modified | `src/lib/chat/system-prompt.test.ts` — new assertions per §3h |
| Modified | `src/lib/workspaces/constants.ts` — `SAMPLE_WORKSPACE` renamed/described as the LeaseLens NJ tenant-law workspace |
| Modified | `src/lib/workspaces/cleanup.ts` — extended cascade order per §3e |
| Modified | `src/db/seed.ts` — seed NJ corpus + sample lease |
| Modified | `src/lib/evals/golden-set.ts` — replaced with 12 NJ cases per §3i Tier 1 |
| Modified | `src/app/page.tsx` — three-pane layout |
| Modified | `src/components/chat/ChatUI.tsx` — wires `RedFlagReport` and `PdfViewer` refs |
| Modified | `src/components/chat/ChatEmptyState.tsx` — LeaseLens copy |
| Modified | `src/components/auth/RoleSwitcher.tsx` — uses `labelFor` |
| Modified | `src/components/cockpit/EvalHealthPanel.tsx` — two-tier eval display |
| Deleted | `src/lib/tools/mutating-tools.ts` and its tests |
| Deleted | `src/corpus/*.md` (old Side Quest Syndicate files) |
| Deleted | `src/lib/evals/golden-set.ts`'s old cases (replaced inline) |
| Sprint-plan-decides | GitHub Actions workflow `.github/workflows/eval.yml` for Tier 1 + manual Tier 2 |
| Sprint-plan-decides | Deletion vs migration of `content_calendar` and `approvals` tables (current call: keep tables, drop tools) |
| Sprint-plan-decides | README rewrite copy + Loom shot list |
| Sprint-plan-decides | Vercel deploy config (env vars, build command) and live URL |

The sprint plan (next §7 step) names exact tasks and verification
commands per file. "Sprint-plan-decides" rows are scope the sprint-
plan author chooses based on time budget; default is to include them
all.

---

## 4. Acceptance criteria

A reviewer following the demo flow on the public Vercel deployment
verifies the following. Each item is testable; the sprint plan maps
each to a concrete verification.

1. Open the deployed URL. Header reads "LeaseLens." Empty state
   offers two paths: "Use sample lease" and "Upload your NJ lease."
   The disclaimer text is visible.
2. Click "Use sample lease." Within 5 seconds, the seeded sample NJ
   lease appears in the left pane (`react-pdf` rendered), the chat
   pane displays the `LeaseScanCTA` empty-state with a "Run the
   standard scan" button (auto-prompt mechanism per §3f), and the
   right pane shows the four-step workflow placeholder. If the
   uploaded lease produces zero clauses (degenerate input), the
   chat instead surfaces a one-line warning naming the paste-text
   fallback per §3c.
3. Send "Run the standard scan." The agent calls `extract_clauses`,
   then iteratively calls `grade_clause_severity` for each non-
   unknown clause. The right pane streams red-flag cards as
   gradings complete. Each card shows the clause type, severity, a
   citation chip with the statute number, and a reasoning sentence.
4. Click a citation chip. The PDF viewer scrolls to the cited
   clause's page. The chip's chunk id is verified live against the
   corpus (no broken citations).
5. Send "Draft a polite negotiation email for the late-fee
   clause." The agent calls `draft_negotiation_email`. The
   ToolCard surfaces the drafted email with an Undo button. Click
   Undo; the audit row's status flips to `rolled_back` and the
   `negotiation_emails` row is gone. (Tenant-ownership enforcement
   per §2.12 is verified by an integration test —
   `lease-tools.integration.test.ts` — not by a manual smoke step;
   reproducing it interactively would require seeding two users
   mid-demo and is out of acceptance scope.)
6. Switch role from Tenant → Admin via the role switcher. The
   role chip in the header updates to "Admin." Open `/cockpit`.
   The audit panel lists the email-draft and its rollback. The
   eval-health panel shows Tier 1 retrieval results (12/12 or close
   to it) and a Tier 2 button that runs a one-case eval on demand
   (cost guardrails permitting).
7. Send "Show me the severity heatmap." The agent calls
   `render_workflow_diagram` with a Mermaid flowchart whose nodes
   are color-coded by severity. The diagram fades in (Sprint-12
   motion preserved).
8. Refresh the page (no logout). The active lease's text, clauses,
   gradings, and conversation history all persist via SQLite. The
   PDF viewer's left pane surfaces a re-upload prompt because the
   PDF binary is not persisted (intentional, see §9). The chat and
   right pane continue to function against the persisted state.
9. Upload an arbitrary text-layer NJ lease via the upload button.
   The same flow runs against the new lease.
10. Upload a scanned-image PDF (no text layer). The route returns
    422; the UI shows the paste-text fallback and an explanatory
    message. (OCR is out of scope.)
11. Upload a PDF >1 MB. The route returns 413; the UI shows the
    size-limit message.
12. As an anonymous visitor on the deployed demo, exhaust the 10-
    request rate limit. The chat returns the existing rate-limit
    message; the cockpit panel reflects the count. (Sprint 3
    behavior preserved.)
13. As an anonymous visitor, drive cumulative spend to the daily
    ceiling. The chat returns the existing spend-ceiling message
    pointing at the GitHub repo. (Sprint 3 behavior preserved.)
14. README at the repo root opens with the LeaseLens thesis, an
    architecture diagram (rendered via the existing `MermaidDiagram`
    component or a static export), Quick Start with the
    `claude_desktop_config.json` snippet for the `leaselens` MCP
    server, an eval-results badge, and a 90-second Loom embed.
15. The recorded Loom shows: open URL → use sample lease → run scan
    → click a citation → PDF scrolls → diagram renders → draft
    email → Undo it → click eval page. ≤ 90 seconds.

---

## 5. Verification commands

The standard charter §10 surface runs unchanged:

```
npm run typecheck
npm run lint
npm run test
npm run eval:golden          # Tier 1 retrieval, real ANTHROPIC_API_KEY
```

Plus sprint-13-specific commands:

```
npm run test:e2e             # Playwright; CONTENTOPS_E2E_MOCK=1 (renamed → LEASELENS_E2E_MOCK=1)
npm run eval:leases          # Tier 2 lease-grading, real ANTHROPIC_API_KEY, gated by daily-spend ceiling
npm run mcp:server           # script target points at mcp/leaselens-server.ts
npm run db:seed              # seeds NJ corpus + sample lease
```

Manual smoke (operator runs after impl QA, recorded in `impl-qa.md`):

- Acceptance criteria 1-13 on a local `npm run dev` against a freshly
  seeded DB.
- Acceptance criteria 14-15 on the deployed Vercel instance.

A sprint is not complete until all declared verification commands
pass from a clean checkout (charter §10) AND the Vercel deploy is
publicly reachable.

---

## 6. Sprint-to-sprint contracts

What this sprint preserves from prior sprints:

- **Sprint 0** — env validation via Zod, configurable DB path, Vercel-
  compatible build. Env-var prefix is renamed but the schema-level
  validation contract is unchanged.
- **Sprint 1** — homepage chat shell, NDJSON streaming, scroll
  architecture. The new three-pane layout wraps the existing chat;
  the chat component itself does not break.
- **Sprint 2** — session cookie, role overlay. Role labels render via
  `labelFor`; the cookie payload is unchanged.
- **Sprint 3** — Anthropic streaming, demo guardrails. Both preserved
  verbatim. The model pin and rate-limit/spend-ceiling code is
  untouched except for the env-var prefix rename.
- **Sprint 4–5** — RAG ingestion + retrieval. `retrieve.ts` is
  unchanged; the corpus content swap is the change. Hybrid retrieval
  remains vector + BM25 + RRF.
- **Sprint 6** — eval harness. `runner.ts` is unchanged; `golden-set`
  cases swap, and a new Tier 2 runner is added alongside.
- **Sprint 7** — tool registry + MCP. The registry and MCP server
  are reused; tool list changes per §3b.
- **Sprint 8** — mutating tool + audit + rollback. The atomic-
  transaction contract is preserved verbatim. The two ContentOps
  mutating tools are removed; one LeaseLens mutating tool is added,
  using the same `MutationOutcome` shape and the same `idempotent
  DELETE-by-id` rollback shape.
- **Sprint 9** — operator cockpit. The cockpit panels are reused;
  the eval panel is extended (§3i), the rest are unchanged.
- **Sprint 10** — UI polish. All polish is preserved — the new PDF
  viewer and red-flag report follow the same focus/spacing/animation
  conventions.
- **Sprint 11** — workspaces. The workspace model is preserved
  verbatim. The sample workspace name and content swap; the
  workspace cookie, TTL, and lazy purge are unchanged. Lease upload
  is a *new* per-conversation input path that is workspace-scoped via
  the existing context.
- **Sprint 12** — diagram tool + motion. Both preserved verbatim.
  The diagram tool gets two new in-domain prompt cases; the tool
  surface itself is unchanged.

What this sprint changes that downstream sprints (none yet) would
need to honor:

- The DB-vs-UI role mapping (§3g). Any future sprint that adds a
  role-aware feature must read labels via `labelFor` and compare via
  the existing `Role` literal.
- The corpus-vs-lease distinction (§2.2). Future sprints adding more
  legal-document types must extend `clauses` and `leases`, not the
  `documents`/`chunks` corpus tables.
- The Tier 1 / Tier 2 eval split (§3i). Future sprints adding more
  expensive evals must follow the same opt-in CI pattern.

---

## 7. Out of scope (explicit)

- Multi-jurisdiction support beyond NJ (charter §11a v1.13).
- OCR fallback for scanned-image leases (charter §11a v1.13).
- Real outbound SMTP / Mailgun email delivery (charter §11a v1.13).
- A 25-case lease-grading eval — trimmed to 12 in v1 (§3i).
- Dropping the `content_calendar` and `approvals` tables in this
  sprint. The tables stay; only their tools are removed. A follow-up
  may drop them.
- Migrating session cookies to the new role labels — the cookie
  payload stays on the DB-level literals.
- Lease-text embedding into the RAG index (charter §5.12 v1.13).
- A mobile-targeted design or polish pass. The natural Tailwind
  flex-wrap stacks the three panes vertically below 1024px (§3f);
  this is incidental, not exercised in acceptance criteria, and not
  designed.
- Lease comparison (uploading two leases and diffing them).
- A "redline mode" that rewrites the lease — out of scope and would
  cross the legal-advice line.
- Stripe / payment surfaces.
- Any new third-party API integration. Anthropic is the only outbound
  call (charter §5.10).

---

## 8. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `pdfjs-dist` Node-runtime worker setup is fiddly | High | Medium | Sprint plan must spike the upload route on day 1 with a fixture PDF; if the Node-side worker import is ugly, fall back to `unpdf` (a pdfjs reskin for Node) or a lighter `pdf-parse` (last resort, accept the maintenance debt). |
| Naive clause segmentation misses clauses on real leases | High | Medium | The classifier handles `'unknown'` gracefully; the eval (§3i) measures recall and surfaces misses. The classifier is improved in a follow-up if needed. |
| Citation hallucinations | Medium | High | §2.6 invariant — `grade_clause_severity` validates the cited chunk against the live corpus and throws on miss. The eval enforces ≥0.90 groundedness. |
| Tier 2 eval cost exceeds daily ceiling | Medium | Medium | Trimmed to 12 cases; gated by manual trigger / commit-message label, not every PR. Operator can run subset on demand. |
| Renaming env vars breaks the deployed Vercel instance | Medium | High | Sprint plan calls out the Vercel-side env rename as a deployment task; the deploy is verified end-to-end before declaring sprint done. |
| Role rename confuses existing tests | Medium | Low | DB-level literals unchanged; tests that compare `'Creator'` etc. still work. Tests that surfaced role labels to humans are updated to use `labelFor`. |
| `react-pdf` SSR hydration mismatch | Medium | Low | Component is `'use client'` + dynamic-imported; falls back to a skeleton on first paint, mirroring the Sprint-12 `MermaidDiagram` pattern. |
| 1 MB / 30-page upload cap is too restrictive for some real leases | Low | Low | Cap is configurable via `LEASELENS_LEASE_MAX_BYTES` and `LEASELENS_LEASE_MAX_PAGES` env vars; demo defaults are conservative. |
| Operator's NJ tenant-law corpus has gaps | Medium | Medium | The 13 issue families in §3d are required core; the eval recall threshold catches gaps. Provenance recorded in `_references/README.md` per §3d. |
| Time overrun on UI polish | High | Low | The "if running over by Day 9" cuts in the approved high-level plan still apply: drop `draft_negotiation_email` first, then drop the GitHub Actions eval CI, then drop the cockpit two-tier eval display. None of those affect the demo's core story. |

---

## 9. Known limitations / deferred

These are accepted limitations in v1 and recorded for follow-up sprints:

- **No history of past lease scans.** The `negotiation_emails` table
  records mutations, but there is no UI to browse "leases I have
  scanned in this workspace before." The cockpit audit panel is the
  closest surrogate.
- **No clause-level highlighting in the PDF viewer.** Click-through
  jumps to the page, not the exact bounding box. Bounding-box
  highlighting requires `pdfjs` text-layer overlay work that is out
  of scope.
- **No diff between user lease and a "canonical" reference lease.**
  Comparison features deferred.
- **Single workspace per visitor on the demo.** The Sprint-11
  workspace switcher exists but defaults to the sample LeaseLens
  workspace; uploading a lease attaches to whichever workspace is
  active, but the demo is designed around one workspace.
- **No persistent visitor identity.** Same as Sprint 11 — anonymous
  visitors on the demo lose their lease when the workspace TTLs out.
- **PDF binary is not persisted across page refresh.** The lease's
  parsed text, clauses, gradings, and audit log all live in SQLite,
  but the original PDF bytes are held only in in-flight memory. On
  refresh the left-pane viewer prompts the user to re-upload to
  view the PDF; the rest of the app continues to function. This is
  the §5.12 corpus-vs-input distinction taken seriously — session
  input does not become persistent state.

---

## 10. Charter amendment dependency

This spec relies on charter v1.13. The amendment landed earlier in
the same operator session that produced this draft. If a future
session reverts to v1.12, this spec is invalid and Sprint 13 reverts
to its v1.12 framing (Demo Deployment + README + Loom of the
ContentOps product).

---

## 11. Sprint-plan-decides

The sprint plan author owns these calls within the constraints of
this spec:

1. Exact `pdfjs-dist` and `react-pdf` versions (verified via
   Context7 per charter §15a).
2. Whether to use a `next/dynamic` import or an `useEffect`-mounted
   import for the PDF viewer client island.
3. Whether the lease-upload route runs the segmentation and
   classification synchronously (accepting longer route latency) or
   defers to a separate "process lease" step (accepting more
   plumbing). Default: synchronous.
4. The exact ordering of file-rename commits (one big rename commit
   vs incremental) — the spec only requires that all renamed
   identifiers land atomically per §2.11.
5. Whether GitHub Actions for Tier 1 eval CI runs on every PR (yes,
   default) or only on PRs touching `src/lib/evals/`.
6. The exact README copy and Loom shot order.
7. Whether the seeded sample lease ships as a `.pdf` or as a `.md`
   that gets rendered to PDF at seed time. Default: a real `.pdf` so
   the viewer is exercised end-to-end.
8. The exact CI job name(s) and failure thresholds — Tier 1 must
   fail on regression vs the latest baseline JSON; Tier 2 cost-vs-
   recall threshold is the operator's call, not the spec's.
9. Whether to keep or delete the residual `mutating-tools.test.ts`
   fixtures.
10. The exact form of the "this is not legal advice" disclaimer
    string — the spec mandates its presence; the wording is the
    sprint plan author's call within the §2.8 invariant.
