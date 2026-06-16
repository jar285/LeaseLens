# LeaseLens

A NJ residential lease red-flag reviewer. Drop a lease PDF in, get a clause-by-clause severity grading grounded in NJ tenant-law statutes, and ask the assistant to explain a clause in plain English or draft a polite negotiation email back to the landlord — every grading carries a verifiable statute citation, and every mutating action is written to an audit trail.

Built to demonstrate how an LLM agent can deliver high-stakes domain judgement under engineering constraints: hybrid RAG against a curated NJ corpus, a tool-use loop with citation grounding enforced inside the tool, RBAC + an audit log on every mutation, and a deterministic two-tier eval harness that runs in CI.

> **Not legal advice.** LeaseLens reviews NJ residential leases and grades clauses against NJ tenant-law sources. It is not a lawyer; its output is not legal advice. Before acting on any clause grading or draft email, consult a tenant attorney or your local NJ legal-aid clinic.

**Status:** runs end-to-end locally. **Roadmap:** production hardening for a public Vercel deploy — hosted DB (libSQL/Turso or Postgres), real auth + per-user data isolation, and cost/rate caps — plus a Loom walkthrough.

---

## Why This Fits AI Product Engineering

Most chat demos avoid serious domains because grounding is hard. LeaseLens leans into one: NJ tenant law. The model never asserts a statute it cannot point to in the corpus, mutating tool calls are wrapped in an audit log (with an operator-side undo for Reviewers/Admins), and a deterministic eval harness measures retrieval quality and severity-grading accuracy on every PR.

The project emphasises product judgement as much as model integration. Severity grading is grounded by construction — the tool throws if the cited `chunk_id` is not in the retrieved set, or if the statute string does not appear verbatim in that chunk. The negotiation-email tool runs the LLM call *before* opening the SQLite transaction, so a slow generation cannot block writers; the transaction wraps only the row insert and the audit log.

---

## What This Project Demonstrates

A portfolio piece targeting Forward Deployed, AI Product, and Applied AI engineering roles. In order of priority:

1. **LLM + agent + RAG composition** — Anthropic streaming chat with a 15-iteration tool-use loop, hybrid retrieval (vector + BM25 + reciprocal rank fusion) against a 28-document NJ tenant-law corpus, and four lease-specific tools wired into the same registry that gates the prompt's tool manifest.
2. **Citation discipline** — `grade_clause_severity` validates the model's chunk_id and statute string against the live corpus before returning. A failed citation throws and surfaces in the UI; the model has to retry or admit it cannot ground the claim.
3. **AI evaluation, two tiers** — Tier 1 measures retrieval quality (Precision@K, Recall@K, MRR, Groundedness) on 12 NJ tenant-law golden cases. Tier 2 measures end-to-end severity-grading accuracy on 12 curated lease clauses. Both exit 0/1 and write machine-readable reports the cockpit displays side-by-side.
4. **Engineering constraints** — Strict RBAC (Tenant / Reviewer / Admin) enforced at the registry filter and re-checked at execute time. Lease ownership is a separate axis (a Tenant only sees leases they uploaded). Mutating tools execute inside a `better-sqlite3` transaction with a paired audit-log insert. The tenant-facing draft-email result is a copy-to-clipboard card; the Undo / compensating-action path is an **operator** affordance — the Reviewer/Admin `ToolCard` and the cockpit audit feed run `POST /api/audit/[id]/rollback` atomically.
5. **Evidence highlighting (page anchoring)** — every red-flagged clause is highlighted on the PDF itself: the matched lease text is tinted on react-pdf's text layer, the selected clause gets a framed halo + a floating concern label, and gutter markers map the risks down the page edge — so one click moves from card → exact source text → explanation. Pure client-side text-layer matching: no stored coordinates, no schema change.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Next.js 16 App Router                                    │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Parser-first workspace (/) — Mode A → Mode B router│  │
│  │  Mode A (no lease) : LeaseHeroDropzone — upload     │  │
│  │  Mode B (lease set): two-column grid                │  │
│  │  ┌────────────────┐ ┌──────────────────────────┐    │  │
│  │  │   PdfViewer    │ │ RedFlagReport+ClausesList│    │  │
│  │  │   react-pdf    │ │ severity + cite + jump   │    │  │
│  │  └────────┬───────┘ └──────────────┬───────────┘    │  │
│  │  Chat lives in a floating AssistantFab drawer       │  │
│  │  (anchored bottom-right; preserves draft + thread   │  │
│  │  across close→open; "Clear assistant chat" resets   │  │
│  │  only the chat thread, never the lease/results).    │  │
│  └────────┼─────────────────────────────┼──────────────┘  │
│           │                             │                  │
│   POST /api/leases             POST /api/chat              │
│   (multipart PDF →             (NDJSON stream + tool-use   │
│   parse + segment              loop, max 15 iters — drives │
│   + classify)                  scan + assistant follow-ups)│
└──────────────────────┬───────────────────────────────────┘
                       │
        ┌──────────────▼───────────────────────────────┐
        │  ToolRegistry  (RBAC-filtered, audited)       │
        │  Read-only:  search_corpus                    │
        │              get_document_summary             │
        │              list_documents (Admin)           │
        │              extract_clauses                  │
        │              grade_clause_severity            │
        │              get_lease_findings               │
        │  Visual:     render_workflow_diagram          │
        │  Mutating:   draft_negotiation_email          │
        │                                               │
        │  Mutating tools: async `prepare` step (LLM    │
        │  call) runs first, then a sync transaction    │
        │  wraps the row insert + audit_log insert.     │
        └──────────────────────┬───────────────────────┘
                               │
        ┌──────────────────────▼───────────────────────┐
        │  SQLite (better-sqlite3, WAL)                 │
        │  users · sessions · conversations · messages  │
        │  documents · chunks      ← NJ tenant-law only │
        │  leases · clauses        ← session input,     │
        │                            never embedded     │
        │  negotiation_emails · audit_log               │
        │  workspaces                                   │
        └──────────────────────┬───────────────────────┘
                               │
        ┌──────────────────────▼───────────────────────┐
        │  RAG pipeline (corpus only)                   │
        │  Ingest → Chunk → Embed (Xenova WASM)         │
        │  Retrieve: vector + BM25 + RRF                │
        └───────────────────────────────────────────────┘

        ┌───────────────────────────────────────────────┐
        │  Lease pipeline (input-only, never embedded)  │
        │  parsePdf (pdfjs-dist) → segmentClauses       │
        │     → classifyClause → INSERT clauses         │
        └───────────────────────────────────────────────┘
```

**Corpus / lease distinction.** The NJ tenant-law corpus is the only thing in `documents` / `chunks`. Lease PDFs are session-scoped *input*: parsed server-side, segmented into numbered clauses, classified by type, and stored in `leases` / `clauses`. They are **never** embedded into the RAG index, so retrieval grounding always points to NJ statutes — not to the user's own document.

**Citation grounding.** `grade_clause_severity` runs `retrieve()` against the corpus, asks the model to cite both a `chunk_id` and a human-readable `statute_citation`, and validates both before returning: the chunk_id must be in the retrieved set, and the statute string must appear (case-insensitive, whitespace-collapsed) inside that chunk's text. Either failure throws.

**Audit invariants.** `draft_negotiation_email` is the single mutating tool. The Anthropic `messages.create` call runs in an async `prepare` step *before* the transaction, so the SQLite write window is short. The transaction wraps the `negotiation_emails` insert and the `audit_log` insert — if either fails, both roll back. In the tenant product the result renders as a copy-to-clipboard `NegotiationEmailCard` (no Undo). The compensating-action **undo** is an operator affordance: the Reviewer/Admin `ToolCard` and the cockpit audit feed expose an Undo button that runs `POST /api/audit/[id]/rollback`, which executes the compensating action (`DELETE FROM negotiation_emails WHERE id = ?`) and updates the audit row's status atomically.

**PDF evidence highlighting.** Graded clauses are highlighted on the rendered PDF via react-pdf's `customTextRenderer`: a client-side matcher ([`highlight-match.ts`](src/lib/lease/highlight-match.ts)) normalises the stored clause text and finds it in the page's live text layer, so marks realign on zoom/scroll for free — no stored coordinates, no schema change. Passive marks stay calm; the active clause gets a computed evidence-frame overlay (halo + glow + a floating "§ · concern" label) and a severity gutter marker. Severity is never colour-alone (glyph + label + aria), and all motion respects `prefers-reduced-motion`.

**Observability.** One structured `pino` logger ([`src/lib/log/`](src/lib/log/)) with a PII-redaction allowlist (no raw lease/clause text or draft-email bodies reach logs or the persisted `tool_calls.error_message`), per-request correlation IDs ([`src/lib/http/`](src/lib/http/)) so a chat round-trip traces end-to-end, accessible error boundaries, and a CI workflow gating the four checks + a Playwright e2e job on every PR (Sprint 44).

**Custom MCP server** at [`mcp/leaselens-server.ts`](mcp/leaselens-server.ts) exposes the registry over stdio for Claude Desktop, Cursor, or any MCP client.

<img width="1439" height="717" alt="Screenshot 2026-06-02 at 1 11 51 AM" src="https://github.com/user-attachments/assets/30f53823-8a1d-49db-b55c-3a51c49332b0" />

<img width="2048" height="1014" alt="image" src="https://github.com/user-attachments/assets/6480d62c-4e2c-4742-8c74-ac4598598d23" />



---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 4 |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| LLM | Anthropic Claude (`claude-haiku-4-5` default) |
| Embeddings | `@huggingface/transformers` (WASM, local, no API key) |
| PDF | `pdfjs-dist` (server parse) + `react-pdf` (client viewer) |
| Diagrams | `mermaid@^11` (client-side, `securityLevel: 'strict'`) |
| Animation | `motion@^12` (formerly `framer-motion`) |
| MCP | `@modelcontextprotocol/sdk` (stdio transport) |
| Testing | Vitest 4 (unit + integration), Playwright (E2E) |
| Linting | Biome |
| Validation | Zod 3 |

---

## Prerequisites

- Node.js 20.9.0+
- An [Anthropic API key](https://console.anthropic.com/)
- Git

---

## Running Locally

### 1. Clone and install

```bash
git clone https://github.com/jar285/LeaseLens.git
cd LeaseLens
npm ci
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Open `.env.local` and set:

```env
ANTHROPIC_API_KEY=sk-ant-...                 # required — your Anthropic API key
LEASELENS_SESSION_SECRET=<32+ chars>         # required — any random string ≥ 32 characters
LEASELENS_DB_PATH=./data/leaselens.db
LEASELENS_DEMO_MODE=false
LEASELENS_ANTHROPIC_MODEL=claude-haiku-4-5
LEASELENS_DAILY_SPEND_CEILING_USD=2
LEASELENS_LEASE_MAX_BYTES=1048576            # 1 MB upload cap
LEASELENS_LEASE_MAX_PAGES=30
LEASELENS_AUTO_SCAN_ENABLED=true             # optional — auto-run the scan on a fresh upload
LEASELENS_LOG_LEVEL=info                     # optional — pino log level (Sprint 44)
```

### 3. Start the dev server

```bash
npm run dev
```

The first `npm run dev` automatically seeds the database (via `predev`). Seeding ingests the 28-document NJ tenant-law corpus, generates embeddings locally via WASM, and copies a sample NJ residential lease into `leases` / `clauses` so reviewers can try the workflow without uploading anything. Takes ~30 seconds on a cold run.

Open [http://localhost:3000](http://localhost:3000).

If you want to seed manually:

```bash
npm run db:seed
```

The seed script is idempotent — it skips work if `chunks` is already populated.

---

## Trying It Out

The home page opens in **Mode A** — a parser-first landing screen with a hero dropzone, the five-step flow (Upload → Parse → Extract clauses → Flag risks → Review), and trust metrics. Drop a PDF and the page transitions to **Mode B**: a two-column workspace with the PDF viewer on the left and a results stack (red flags + full clause list) on the right. Chat lives in a floating AssistantFab drawer anchored bottom-right — open it to ask follow-up questions, draft a negotiation email, or run the standard scan again. The drawer preserves typed drafts and the FAB-side clause selection across close→open cycles; "Clear assistant chat" resets only the chat thread (announced via aria-live: *"Assistant chat cleared. Your lease review was preserved."*), leaving the lease and results intact. The destructive "Replace" button in the workspace header is the only path that retires the active lease, and it requires confirmation via a styled `alertdialog` (with a calm fade/scale, disabled under `prefers-reduced-motion`).

The default workspace is the seeded sample, so you have a lease to inspect immediately.

### As Tenant (default role)

The Tenant sees only leases they uploaded. The full lease toolset is available — `extract_clauses`, `grade_clause_severity`, `get_lease_findings`, `draft_negotiation_email` — plus read-only corpus search. Once a lease has been graded, follow-up questions about the findings are answered from stored gradings via `get_lease_findings` (Sprint 45) instead of re-running the whole scan.

Try, in this order:

- *"Run the standard scan."* — the assistant calls `extract_clauses`, then `grade_clause_severity` for each non-trivial clause in turn. The right-hand red-flag report fills in as gradings come back; each card shows the severity, a NJ statute citation, the assistant's plain-English reasoning, and a recommended action. Each graded clause is highlighted directly on the PDF (soft severity tint + a gutter marker). Click a citation chip to scroll the PDF viewer to the cited clause and frame the exact lease text behind the flag. Expand a card for one-click quick actions that pre-seed the drawer: **Plain English** (jargon-free, tenant-facing explanation), **What the law says** (statute-verbatim walkthrough), and **Draft email** — plus **View on page N** to jump the PDF.
- *"What does NJ law say about security-deposit caps?"* — direct corpus search via `search_corpus`. Every answer is grounded in retrieved chunks.
- *"Draft a polite email to my landlord about the security deposit clause."* — the assistant calls `draft_negotiation_email` with the most-recent grading's reasoning + statute citation as context. For a Tenant the result renders inline as a copy-to-clipboard `NegotiationEmailCard` (subject + body); Reviewers/Admins see the raw `ToolCard` with an Undo affordance instead. Either way the write is captured in the audit log.

### As Reviewer / Admin

Reviewer (DB literal `Editor`) and Admin see every lease in the workspace, not just their own uploads. Admin additionally sees the full audit log — including MCP-originated mutations — and `list_documents` for corpus inventory.

Open `/cockpit` (Reviewer or Admin only) for the operator dashboard: today's spend vs the daily ceiling, the audit feed, scheduled negotiation emails, and a two-tier eval-health panel showing the most recent Tier 1 + Tier 2 runs side-by-side.

> **About negotiation emails:** the `draft_negotiation_email` tool writes a SQLite row — it does **not** send the email anywhere. The artifact is a JSON record in the audit trail. A production deployment would integrate the same audit pattern with a real SMTP/Mailgun backend.

### Switching workspaces

Click the workspace label in the header to open the switcher. From there you can use the seeded sample, drag in your own lease PDF, or jump back to a previously-uploaded one. Each upload TTLs after 24 hours via lazy cleanup on the next upload.

### Where to get a test lease

The seeded sample lease ([`src/corpus/sample-lease/sample-nj-residential-lease.pdf`](src/corpus/sample-lease/sample-nj-residential-lease.pdf)) loads automatically on the first `npm run dev` and exercises every clause type the grader recognises. If you want to walk the upload flow with a different document, any **text-layer NJ residential lease PDF, ≤ 1 MB, ≤ 30 pages** works. Free template sources that meet the requirement:

| Source | What it is | Notes |
|---|---|---|
| [eForms — NJ Residential Lease Agreement](https://eforms.com/rental/nj/) | Free PDF template generator | Fills with placeholder text; downloads as text-layer PDF ready for upload |
| [LawDepot — NJ Lease](https://www.lawdepot.com/contracts/residential-lease-agreement/?loc=US-NJ) | Free preview PDF | Print-to-PDF the preview; clauses cover security deposit, late fees, repairs |
| [Rocket Lawyer — NJ Lease](https://www.rocketlawyer.com/real-estate/landlords/residential-property/document/lease-agreement) | Free preview | Same pattern — print preview to PDF |
| [NJ DCA Truth in Renting guide](https://www.nj.gov/dca/codes/publications/pdf_lps/t_i_r.pdf) | Official tenant-rights booklet | Not a lease itself, but useful as a corpus check for the `search_corpus` tool |

> **Don't upload a real personal lease.** The PDF binary isn't persisted (parsed clauses are kept in SQLite only, blob URLs expire on tab close), but treat the local DB as throwaway dev data — it isn't encrypted at rest. A redacted template is the right test artefact.

**Avoid:** scanned-image PDFs (no text layer → 422 with `error: 'pdf_no_text_layer'`), commercial leases, and leases from other states (the system prompt instructs the model to refuse non-NJ residential).

### Prompts to try

A library of prompts that exercise different parts of the tool surface. Each maps to a specific tool path so you can verify the chain of reasoning + citation grounding. Drop the seeded sample (or your own upload) into the left pane, then send any of these into the chat:

#### Standard scan + red-flag triage

- *"Run the standard scan on this lease."* — chain: `extract_clauses` → `grade_clause_severity` per clause. Watch the right-pane Red Flag report fill in over ~30s.
- *"Which clause is the most concerning, and why?"* — narrative summary on top of the standard scan. Tests that the model surfaces severity ordering verbatim from grading results.
- *"Show me only the high-severity red flags."* — filtered re-statement; tests the model's ability to read its own scan output.

#### Specific clause lookups

- *"Read the security-deposit clause and tell me if it's enforceable under NJ law."* — `extract_clauses` + a single targeted `grade_clause_severity` call. Result should cite N.J.S.A. 46:8-19 (the 1.5-month cap).
- *"Is the late fee in this lease legal? Quote the section that talks about it."* — tests both grading and verbatim-quote retrieval from clause text.
- *"What does the lease say about early termination, and what's NJ law's position?"* — paired clause-text + `search_corpus` ground.
- *"Compare the attorney's-fees clause to NJ statute. Is it one-way or reciprocal?"* — tests `attorneys_fees` clause classification + the asymmetry check.

#### Direct corpus questions (no lease required)

- *"How much can a NJ landlord legally charge for a security deposit, and is interest required?"* — `search_corpus`; should return the security-deposit-cap chunk verbatim.
- *"Under what circumstances can a NJ tenant break a lease early without penalty?"* — `search_corpus` against the early-termination corpus (domestic violence / senior-disabled / general).
- *"What notice does a NJ landlord have to give before entering the apartment?"* — `search_corpus` → entry-notice + entry-emergency.
- *"Cite the NJ statute on retaliation against a tenant who reports code violations."* — verbatim citation lookup (N.J.S.A. 2A:42-10.10).

#### Negotiation drafting

- *"Draft a polite email to my landlord about the security deposit clause."* — `draft_negotiation_email` (mutating; produces an audited row — a copy-to-clipboard card for Tenants, the `ToolCard` + Undo affordance for Reviewers/Admins).
- *"Draft a firmer email about the late-fee structure — this isn't negotiable for me."* — same tool with `tone: "firm"`.
- *"Use a formal tone and request a redline of the early-termination clause."* — `tone: "formal"`. Demonstrates the three-tone copy library.

#### Cockpit-only workflows (Reviewer/Admin)

- Switch to Reviewer or Admin in the header, open `/cockpit`, click the refresh icon on each panel. Tests the server actions wired to the cockpit refresh buttons.
- After a `draft_negotiation_email` call, click **Undo** on the resulting ToolCard. The audit row's status flips to `rolled_back` and the `negotiation_emails` row is deleted in the same transaction. Re-open `/cockpit` and watch the audit feed refresh.

#### Edge cases worth poking at

- *"Summarise this lease in plain English for someone with no legal background."* — non-tool path; pure RAG-grounded chat. Tests that the model still cites NJ law when the user doesn't ask for citations explicitly.
- *"Is anything in this lease actually unenforceable? Don't be polite about it."* — tests the disclaimer override; the system prompt should still keep tone professional and citation-bound.
- Upload a 30+ page PDF or a scanned-image lease and confirm the dropzone surfaces the right error pill (size cap or `pdf_no_text_layer`).

---

## Features

### Role-Based Access (Tenant / Reviewer / Admin)

| Role (UI) | DB literal | Tools available | Lease ownership |
|---|---|---|---|
| Tenant | `Creator` | `search_corpus`, `extract_clauses`, `grade_clause_severity`, `get_lease_findings`, `draft_negotiation_email`, `render_workflow_diagram` | Only leases the user uploaded |
| Reviewer | `Editor` | + `get_document_summary` | All leases in workspace |
| Admin | `Admin` | + `list_documents` | All leases + full audit log |

The same registry that filters the prompt's tool manifest also gates execution — if a role can't see a tool in its manifest, it can't invoke it at runtime. Lease ownership is a second axis enforced by `assertLeaseOwnership(lease, ctx)`, called inside every lease tool and the `GET /api/leases/[id]` route guard.

### Citation-Grounded Severity Grading

`grade_clause_severity` retrieves NJ tenant-law chunks for a clause, asks the model to grade severity (`high` / `medium` / `low` / `ok`) and cite a chunk + statute, and validates both before returning. The validator throws if the cited `chunk_id` is not in the retrieved set, or if the `statute_citation` string does not appear inside that chunk's text. The Tier 1 eval enforces a ≥ 0.90 groundedness rate in CI.

### Auditable Mutations

`draft_negotiation_email` is the only mutating tool. The async LLM call runs in a `prepare` step *before* the SQLite transaction; the transaction wraps the `negotiation_emails` insert and the audit-row insert atomically, so every draft is captured in the audit trail. The tenant-facing surface is a copy-to-clipboard `NegotiationEmailCard` — no destructive control. The compensating-action **undo** is scoped to operators: the Reviewer/Admin `ToolCard` and the cockpit audit feed expose an Undo button that calls `POST /api/audit/[id]/rollback`, running the compensating action (`DELETE FROM negotiation_emails WHERE id = ?`) and the status flip in one transaction. Idempotent on already-rolled-back rows.

### Operator Cockpit

`/cockpit` (Reviewer + Admin) shows recent audited actions, scheduled negotiation emails, today's demo spend, and a two-tier eval-health panel. The eval panel renders Tier 1 (retrieval) and Tier 2 (lease grading) side-by-side with a 6-metric grid so you can see retrieval quality and end-to-end accuracy at a glance.

### PDF Pipeline

`POST /api/leases` accepts a `application/pdf` upload (max 1 MB, max 30 pages by default). The route runs `parsePdf(buffer)` from [`src/lib/lease/parse-pdf.ts`](src/lib/lease/parse-pdf.ts) using `pdfjs-dist`, segments each page on numbered-section prefixes (`1.`, `(a)`, `ARTICLE I`), classifies each clause by type (security_deposit, late_fee, early_termination, …), and inserts into `leases` / `clauses`. Scanned PDFs with no text layer return 422 with `error: 'pdf_no_text_layer'` — OCR is out of scope.

The client viewer is `react-pdf` over the same `pdfjs-dist`. **Navigation (Sprint 23h):** Prev / Next page buttons in the dock header drive the same `scrollToPage` path the citation chips use, and `ArrowLeft` / `ArrowRight` on the focusable scroll `<section>` paginate by keyboard (skipped while there's an active text selection so arrow-key selection extension still works). **Width sizing:** a `ResizeObserver` measures the inner page container directly and pins each page wrapper to the canvas width via inline style, so the text layer no longer right-clips at fit-width and zoom past 100 % pans horizontally. Once a lease is graded, the matched clause text is highlighted on that same text layer — see **PDF Evidence Highlighting** below.

### PDF Evidence Highlighting

Red-flagged clauses are highlighted directly on the PDF, turning each severity grade into grounded evidence — one click moves from card → exact lease text → explanation → action. When a scan completes, every graded clause renders as a soft severity-tinted mark on react-pdf's text layer (High + Medium on by default; Low / OK behind a toggle). Selecting a red-flag card focuses its clause: a single rounded **evidence-frame** overlay draws a halo + glow around the whole clause region, a floating glass label (*"Late fee · §3 · High concern"*) sits above the first line, and small severity-shaped **gutter markers** (▲ ◆ ● ✓) down the page edge let you scan a long lease without heavy highlights everywhere. Severity is never communicated by colour alone (every mark carries a glyph + an `aria-label`), all motion respects `prefers-reduced-motion`, and clause text is HTML-escaped before injection. This supersedes the old page-only "View on page N" jump — the citation chip and the **View on page** action now scroll to *and* frame the exact clause, not just its page.

It is powered by a pure client-side text-layer matcher ([`highlight-match.ts`](src/lib/lease/highlight-match.ts)): the same stored clause text the cards use is normalised and located in the page's live text layer at render time, so there are **no database / schema / parsing changes and no stored coordinates**, and highlights realign automatically on zoom, scroll, and rotation via react-pdf's `customTextRenderer`. New highlight state (visibility, severity filter, hover) lives in its own `PdfHighlightContext`; click-focus reuses the existing `activeClauseId`, so the pinned chat / parser context boundaries are untouched. Show/hide + per-severity filter controls live in the red-flags pane header.

### Two-Tier Eval Harness

| Tier | What it measures | How to run | Cases | Baseline |
|---|---|---|---|---|
| 1 | Hybrid retrieval quality on NJ tenant-law queries (Precision@K, Recall@K, MRR, Groundedness) | `npm run eval:golden` | 12 | 10/12 pass at 40.4 / 48 pts ([baseline](data/eval-reports/baseline-sprint-14.json)) |
| 2 | End-to-end `grade_clause_severity` accuracy on curated lease clauses (severity match, citation grounded, statute exact-string) | `npm run eval:leases` | 12 | tracked per-run in `data/eval-reports/` |

Tier 1 makes no LLM calls — it uses the local WASM embedder and is hermetic. Tier 2 calls Anthropic; gate it on a spend ceiling before running on every PR.

### MCP Server

The same registry is exposed over the Model Context Protocol via stdio:

```bash
npm run mcp:server
```

Add to your MCP client config:

```json
{
  "mcpServers": {
    "leaselens": {
      "command": "npx",
      "args": ["tsx", "mcp/leaselens-server.ts"],
      "cwd": "/path/to/LeaseLens"
    }
  }
}
```

MCP-originated mutations produce audit rows attributed to actor `mcp-server` inside the sample workspace.

#### Browser-control MCP (Playwright)

The repo also ships a project-level [`.mcp.json`](.mcp.json) that registers Microsoft's [`@playwright/mcp`](https://github.com/microsoft/playwright-mcp) server (headless Chromium, isolated profile, pinned to `0.0.75`). With `npm run dev` running, an MCP-aware client (Claude Code, etc.) can navigate `http://localhost:3000`, take accessibility snapshots, click, type, and screenshot the live UI — useful for interactive verification during sprint work. `npm run test:e2e` remains the source of truth for regression coverage.

### Diagrams (Mermaid)

`render_workflow_diagram` accepts raw Mermaid source for any of eight diagram families (`flowchart`, `graph`, `sequenceDiagram`, `stateDiagram-v2`, `mindmap`, `journey`, `classDiagram`, `erDiagram`). Server-side validation only (prefix regex, length cap, init-directive + line-comment skip); rendering happens client-side via `mermaid@^11` with `securityLevel: 'strict'` and `htmlLabels: false`. Parse errors fall back to a `<pre>` block of the raw code with the error inline.

The diagram entry, assistant message entry, and `ToolCard` expand/collapse are animated via `motion@^12`. All three surfaces honour `prefers-reduced-motion`: when set, animations are skipped entirely (not slowed) and the DOM renders the plain equivalents. The `mermaid` bundle is dynamic-imported, so the cost is paid only on the first render.

### Observability & Logging

A developer-facing reliability layer (Sprint 44): one structured `pino` logger ([`src/lib/log/`](src/lib/log/)) replaces scattered `console.*`, every request carries a **correlation ID** so a chat round-trip can be traced end-to-end (RAG → Anthropic stream → tool execution) via [`src/lib/http/`](src/lib/http/), client crashes fall back to accessible error boundaries (`error.tsx` / `global-error.tsx`), and a **PII-redaction allowlist** keeps raw lease/clause text and the model's draft-email body out of both logs and the persisted `tool_calls.error_message`. Test + coverage reporters and a [`.github/workflows/ci.yml`](.github/workflows/ci.yml) gate the four checks (lint → typecheck → test + coverage → build) on every PR, with a separate Playwright **e2e job** — the suite had silently rotted while ungated and was repaired to a deterministic 30/30 green, now a required gate.

---

## Running the Tests

```bash
# Unit + integration + contract tests (Vitest)
npm run test

# E2E smoke specs (Playwright; auto-launches dev server with the deterministic Anthropic mock)
npm run test:e2e

# Type checking
npm run typecheck

# Linting (Biome)
npm run lint

# Tier 1 retrieval eval (no LLM calls; exits 0/1; writes data/eval-reports/)
npm run eval:golden

# Tier 2 lease-grading eval (calls Anthropic)
npm run eval:leases

# Production build check
npm run build
```

The Playwright config sets `LEASELENS_E2E_MOCK=1` on the dev-server child, which swaps the Anthropic SDK for a deterministic mock at [`src/lib/anthropic/e2e-mock.ts`](src/lib/anthropic/e2e-mock.ts). Specs run against the lease toolset only.

---

## Project Structure

```
LeaseLens/
├── mcp/                                  # Custom MCP server (stdio transport)
│   ├── leaselens-server.ts
│   └── leaselens-server.test.ts
├── scripts/
│   ├── eval-golden.ts                    # Tier 1 CLI entry
│   ├── eval-leases.ts                    # Tier 2 CLI entry
│   ├── seed-if-empty.mjs                 # predev hook — seeds when empty
│   └── copy-pdf-worker.mjs               # postinstall — pdfjs worker into public/
├── tests/e2e/                            # Playwright smoke specs
├── playwright.config.ts                  # webServer.env engages the Anthropic mock
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts             # NDJSON streaming + tool-use loop (max 15 iters)
│   │   │   ├── leases/                   # POST upload + GET [id] + clauses/emails
│   │   │   ├── audit/                    # GET role-filtered list, POST [id]/rollback
│   │   │   ├── workspaces/               # multipart upload + select-sample
│   │   │   └── admin/ping/               # health check
│   │   ├── cockpit/                      # /cockpit dashboard (Reviewer + Admin)
│   │   └── page.tsx                      # Home — parser-first workspace shell (Mode A→B router)
│   ├── components/
│   │   ├── auth/                         # role switcher + session UI
│   │   ├── brand/                        # LeaseLensMark glyph + wordmark / badge classes
│   │   ├── chat/                         # AssistantFab + drawer, ChatUI, ChatTranscript,
│   │   │                                 # ChatMessage, ToolCard, MermaidDiagram
│   │   ├── cockpit/                      # AuditFeed, Schedule, Spend, EvalHealth, SampleWorkspaceSwitcher
│   │   ├── layout/                       # Container, PageShell, ContentPageShell, SiteFooter, MotionProvider
│   │   ├── lease/                        # WorkspaceRouterShell, ParserLandingShell,
│   │   │                                 # ParserResultsShell, PdfViewer, RedFlagReport,
│   │   │                                 # ClausesList, AutoScanRunner, CitationChip, ConfirmDialog,
│   │   │                                 # PdfHighlightContext, PdfEvidenceOverlay,
│   │   │                                 # PdfEvidenceGutter, HighlightControls,
│   │   │                                 # highlight-render, use-clause-highlights
│   │   └── states/                       # EmptyState, ErrorState, LoadingState
│   ├── corpus/
│   │   ├── nj-tenant-law/                # 28 NJ tenant-law markdown sources
│   │   └── sample-lease/                 # seeded sample lease PDF + markdown
│   ├── db/
│   │   └── seed.ts                       # idempotent seed (corpus + sample lease)
│   └── lib/
│       ├── anthropic/                    # SDK singleton + E2E mock
│       ├── audit/                        # audit-log queries
│       ├── auth/                         # session, RBAC types, demo users, role labels
│       ├── chat/                         # system-prompt, context-window, conversations, parse-stream-line
│       ├── cockpit/                      # cockpit data aggregation
│       ├── content/                      # static page copy (privacy, terms, faq)
│       ├── db/                           # schema, migrate, spend, rate-limit
│       ├── evals/                        # Tier 1 runner, Tier 2 runner, golden + lease cases
│       ├── http/                         # request/response helpers
│       ├── layout/                       # layout helpers
│       ├── lease/                        # parse-pdf, segment-clauses, classify-clause,
│       │                                 # validate-upload, queries, ownership, disclaimer,
│       │                                 # highlight-match, escape-html
│       ├── log/                          # pino logger + request context (Sprint 44)
│       ├── motion/                       # SPRING_GENTLE / SPRING_SNAPPY / SPRING_SNAP_BACK
│       │                                 # + EASE_OUT_SOFT presets (Sprint 23g)
│       ├── rag/                          # ingest, chunk, embed (Xenova WASM), retrieve
│       ├── test/                         # shared test fixtures + mock data
│       ├── tools/                        # registry, lease-tools, corpus-tools, diagram-tools,
│       │                                 # audit-log, create-registry
│       ├── env.ts                        # Zod-validated environment schema
│       ├── version.ts                    # masthead version + status stamp
│       └── workspaces/                   # cookie helpers + per-visitor brand list
├── design-system/
│   └── MASTER.md                         # design tokens, typography, motion presets,
│                                         # accessibility rules, anti-patterns
└── docs/
    ├── _architecture/                    # power-words, dev + UI/UX design philosophy
    ├── _meta/                            # charter, guidelines, architecture snapshot
    └── _specs/                           # per-sprint spec.md + impl.md (QA report);
                                          # sub-sprints use N.x-spec.md / N.x-impl.md
```

---

## Sprint History

LeaseLens is built sprint-by-sprint with a spec → QA → sprint plan → implementation → QA loop. All artifacts live in [`docs/_specs/`](docs/_specs/).

Sprints 0–12 shipped the original ContentOps cockpit (the same registry / RAG / audit / eval infrastructure under a media-brand framing). Sprint 13 pivoted the corpus and tool surface to NJ residential leases while preserving every architectural invariant. Sprint 14 hardened the eval harness with Tier 2 lease grading. Sprints 15–22 built out the design system (Tailwind v4 tokens, MASTER.md, Source Serif 4), the tenant-friendly conversational scan UX, and PDF reading controls. The Sprint 23 series modernised what was then a three-pane workspace pane by pane (23a–23f), then 23g–k landed an Open-Design-inspired editorial brand refresh: cream-paper + terracotta palette, Source Serif 4 weight 700 + italic, ink-blue citation token, motion-preset module, accessible PDF page navigation, and an `animate-ping` ripple on the LIVE status indicator. **Sprints 26a–26c pivoted the workspace from the three-pane shell to the parser-first router (`WorkspaceRouterShell` → `ParserLandingShell` for Mode A / `ParserResultsShell` for Mode B), with chat extracted into a floating `AssistantFab` drawer.** Sprints 27–28 hardened FAB persistence, added the tenant-only production header, and ran a bug-triage round. Sprint 29 (29.1–29.13) refactored the FAB + chat assistant production UX. Sprint 30 switched the theme flip to the View Transitions API with a double-rAF fallback. Sprint 31 disambiguated lease metadata in the system prompt to stop the "scan already done" hallucination. Sprint 32 forced `tool_choice` on auto-scan and added a dev-only per-call diagnostic. Sprint 33 (`feature/fab-menu`, merged) reworked the FAB chat surface — 33.A.2 gated the redundant in-chat scan timeline off the auto-scan turn and replaced the model-authored summary with a deterministic scan-complete receipt. Sprint 34 (34.1–34.3) closed the citation-grounding gap *validator-side* — embedded-pointer + de-slugged-title recovery, then markdown-emphasis-aware + cross-chunk matching — driving live scan rejections to zero while still rejecting genuinely ungrounded citations. The Sprint 28 series later added **28.15**, which replaced the native `window.confirm` Replace prompt with a styled `alertdialog` (calm enter/exit motion, WCAG-grounded) and stopped tracking the autogenerated `next-env.d.ts`. Sprint 35 added a **"Plain English"** red-flag card action (a jargon-free, tenant-facing explanation that stays statute-grounded) and relabeled the existing statute-walkthrough pill "Explain" → "What the law says" to disambiguate the two. Sprints 36–38 refined the FAB assistant's context-sizing and its premium help/concierge surfaces; Sprint 41 added the landing footer + glass trust badges and Sprint 42 the static content pages (privacy / terms / FAQ / sources) + favicon; Sprint 43 landed the signature motion set (Mode A→B workspace flip, list stagger, card tap-press, verdict emphasis); Sprint 44 added observability — one structured logger replacing scattered `console.*`, per-request correlation IDs, accessible error boundaries, and PII-redaction guardrails — plus a CI workflow gating the four checks on every PR and a separate Playwright e2e job (the suite had rotted while ungated and was repaired to a deterministic 30/30). Sprint 45 let the chat read stored findings via `get_lease_findings` instead of re-scanning. **Sprints 46–48 shipped PDF evidence highlighting** — a client-side text-layer matcher that ties each red-flag card to the exact lease text via tinted marks, a computed evidence-frame overlay with a floating concern label, and severity gutter markers, all with no database or schema changes. Sprint 49 set the public version stamp to `v1.0` and gave the masthead + hero brand badges a subtle depth lift. (Draft Sprints 39/40 were renumbered to 43/44 to keep spec order == ship order.)

| Sprint | Scope | Status |
|--------|-------|--------|
| 0 | Foundation (Next.js, SQLite, Zod, Vitest) | Complete |
| 1 | Homepage chat UI + streaming shell | Complete |
| 2 | Sessions, message history, role overlay | Complete |
| 3 | Anthropic streaming + cost guardrails | Complete |
| 4 | Corpus ingestion + chunking + embeddings | Complete |
| 5 | Hybrid RAG retrieval + grounded chat | Complete |
| 6 | AI eval harness (Tier 1 retrieval) | Complete |
| 7 | Tool registry + read-only MCP tools | Complete |
| 8 | Mutating tools + audit log + rollback + first Playwright E2E | Complete |
| 9 | Operator cockpit dashboard | Complete |
| 10 | UI polish pass | Complete |
| 11 | Workspaces & brand onboarding | Complete |
| 12 | Diagram tool (Mermaid) + Motion polish | Complete |
| 13 | LeaseLens vertical pivot — NJ corpus, lease tools, three-pane shell | Complete |
| 14 | Tier 2 lease-grading eval, cockpit two-tier display, lint cleanup, manual-smoke template | Complete |
| 15 | UI polish — Tailwind v4 `@theme` tokens, Geist + Source Serif 4 typography, chat-surface refactor | Complete |
| 16A | Design-system documentation ([`design-system/MASTER.md`](design-system/MASTER.md)) | Complete |
| 16B | PDF viewer dark-mode coverage + GFM table support in chat markdown | Complete |
| 18 | Scan-progress UI + tenant-friendly grading scaffolding | Complete |
| 19–22 | Tenant-friendly conversational scan, PDF reading controls (zoom / fit / focus mode), corpus-grounding refinements | Complete |
| 23a | UI foundation tokens — z-index scale, surface-elevation aliases, backdrop tokens, motion-duration normalisation; vestigial workspace-picker removal | Complete |
| 23b | Document dock — LeaseUploadDropzone tray, compact `PdfReadingControls`, two-row dock header, focus-dialog polish, CitationChip hover affordance | Complete |
| 23c | Conversation workspace — compact `ChatEmptyState`, `UploadedLeaseCard` with chips, command-bar `ChatComposer`, ScanTimeline + ActivityDrawer polish | Complete |
| 23d | Risk radar — `SeverityBadge` primitive, refreshed `RedFlagReport`, skeleton card hierarchy, example preview card in the empty state | Complete |
| 23e | Chat memory — `MAX_MESSAGES` raised 20 → 60, system prompt prefers prior tool results on follow-ups, verbatim draft-email rendering | Complete |
| 23f | `NegotiationEmailCard` — clipboard + fade-in, Tenant-mode `draft_negotiation_email` routing, system-prompt refinements | Complete |
| 23g–j | Open Design editorial brand refresh — cream-paper + terracotta palette (light + dark), Source Serif 4 weight 700 + italic, NJSA system anchor + Live · v23.x version stamp (now `v1.0`, Sprint 49) + Nº plate-numbers on red-flag cards, motion-preset module (`src/lib/motion/presets.ts`), `LayoutGroup` + `popLayout` on the rail, ink-blue `--color-citation` token, vellum-inset surface hierarchy; PDF page nav (Prev/Next buttons in `PdfReadingControls` + ArrowLeft/Right on the focusable scroll `<section>`); width-calc fix so the page canvas no longer right-clips at fit-width | Complete |
| 23k | `animate-ping` radar ripple on the LIVE status indicator (Tailwind two-layer pattern, `motion-safe:` gated) | Complete |
| 26a | Parser landing (Mode A) — LeaseHeroDropzone + ParserLandingShell + WorkspaceRouterShell | Complete |
| 26b | Parser results (Mode B) — ParserResultsShell, ClausesList, AutoScanRunner | Complete |
| 26c | Floating AssistantFab — FAB context + card/row action prompts (Explain, Draft email) | Complete |
| 27 | FAB persistence (draft + conversation survive close→open), tenant-only header, six-stage scan loading | Complete |
| 28 | Bug triage — scan animation lifecycle (Bug 2), parser/assistant state split into `LeaseParserContext` (Bug 3), `ParserResultsShell` layout restructure (Bug 1), aria-live announcement on "Clear assistant chat", confirmation gate on Replace; **28.15** later restyled the Replace confirm as an `alertdialog` (enter/exit motion) + gitignored autogenerated `next-env.d.ts` | Complete |
| 29 | FAB + chat assistant production UX refactor (29.1–29.13) — focus management, drawer transitions, composer behavior, accessibility polish | Complete |
| 30 | Smoother theme flip via View Transitions API + double-rAF fallback for browsers without support | Complete |
| 31 | Disambiguate lease metadata in the system prompt to stop the "scan already done" hallucination | Complete |
| 32 | Force `tool_choice` on auto-scan turns + dev-only per-call diagnostic | Complete |
| 33 | FAB chat pivot (`feature/fab-menu`) — 33.A.2 gates the redundant in-chat scan timeline off the auto-scan turn + deterministic scan-complete receipt | Complete |
| 34 | Citation grounding, validator-side — chunk-identity + dash-concat recovery (34.1–34.2), markdown-aware + cross-chunk matching (34.3); live scan rejections → 0 | Complete |
| 35 | "Plain English" red-flag card action (jargon-free, statute-grounded) + relabel "Explain" → "What the law says" | Complete |
| 36 | FAB assistant context-sizing (compact / workspace / expanded-reading) | Complete |
| 37 | Premium FAB help popover | Complete |
| 38 | Premium assistant concierge panel | Complete |
| 41 | Landing footer + glass trust badges | Complete |
| 42 | Content pages (privacy / terms / FAQ / sources) + favicon | Complete |
| 43 | Signature motion — Mode A→B flip, list stagger, card tap-press, verdict emphasis | Complete |
| 44 | Observability — structured logger + correlation IDs + error boundaries + PII redaction; CI gates the four checks on every PR + a separate Playwright e2e job (rotted-while-ungated suite repaired → 30/30) | Complete |
| 45 | Chat reads stored findings (`get_lease_findings`) instead of re-scanning | Complete |
| 46 | PDF evidence highlighting — text-layer matcher, inline marks, controls, scanned-page fallback | Complete |
| 47 | Premium highlighter refinement — evidence-frame overlay, floating label, reveal + single pulse | Complete |
| 48 | Evidence-layer polish — calmer tints, focus-dim, gutter markers, continuous-ribbon fix | Complete |
| 49 | Public version stamp (`v1.0`) + masthead & hero brand-badge lift | Complete |

> **Numbering note:** draft Sprints 39 and 40 were renumbered to **43** and **44** (kept spec order == ship order); Sprint **42** (content pages + favicon) shipped without a dedicated `docs/_specs/` folder. Some early sprints are folded into ranges (e.g. 16A/16B, 19–22) rather than individual rows.

---

## License

MIT
