# LeaseLens

A NJ residential lease red-flag reviewer. Drop a lease PDF in, get a clause-by-clause severity grading grounded in NJ tenant-law statutes, and ask the assistant to draft a polite negotiation email back to the landlord — every grading carries a verifiable statute citation, every mutating action is auditable and reversible.

Built to demonstrate how an LLM agent can deliver high-stakes domain judgement under engineering constraints: hybrid RAG against a curated NJ corpus, a tool-use loop with citation grounding enforced inside the tool, RBAC + audit + rollback on every mutation, and a deterministic two-tier eval harness that runs in CI.

> **Not legal advice.** LeaseLens reviews NJ residential leases and grades clauses against NJ tenant-law sources. It is not a lawyer; its output is not legal advice. Before acting on any clause grading or draft email, consult a tenant attorney or your local NJ legal-aid clinic.

**Deployment status:** local demo is implemented and runs end-to-end; public Vercel deployment + Loom walkthrough are planned for the closeout sprint.

---

## Why This Fits AI Product Engineering

Most chat demos avoid serious domains because grounding is hard. LeaseLens leans into one: NJ tenant law. The model never asserts a statute it cannot point to in the corpus, mutating tool calls are wrapped in compensating actions and an audit log, and a deterministic eval harness measures retrieval quality and severity-grading accuracy on every PR.

The project emphasises product judgement as much as model integration. Severity grading is grounded by construction — the tool throws if the cited `chunk_id` is not in the retrieved set, or if the statute string does not appear verbatim in that chunk. The negotiation-email tool runs the LLM call *before* opening the SQLite transaction, so a slow generation cannot block writers; the transaction wraps only the row insert and the audit log.

---

## What This Project Demonstrates

A portfolio piece targeting Forward Deployed, AI Product, and Applied AI engineering roles. In order of priority:

1. **LLM + agent + RAG composition** — Anthropic streaming chat with a 3-iteration tool-use loop, hybrid retrieval (vector + BM25 + reciprocal rank fusion) against a 28-document NJ tenant-law corpus, and three lease-specific tools wired into the same registry that gates the prompt's tool manifest.
2. **Citation discipline** — `grade_clause_severity` validates the model's chunk_id and statute string against the live corpus before returning. A failed citation throws and surfaces in the UI; the model has to retry or admit it cannot ground the claim.
3. **AI evaluation, two tiers** — Tier 1 measures retrieval quality (Precision@K, Recall@K, MRR, Groundedness) on 12 NJ tenant-law golden cases. Tier 2 measures end-to-end severity-grading accuracy on 12 curated lease clauses. Both exit 0/1 and write machine-readable reports the cockpit displays side-by-side.
4. **Engineering constraints** — Strict RBAC (Tenant / Reviewer / Admin) enforced at the registry filter and re-checked at execute time. Lease ownership is a separate axis (a Tenant only sees leases they uploaded). Mutating tools execute inside a `better-sqlite3` transaction with a paired audit-log insert; the `ToolCard` UI renders an Undo button that runs the compensating action atomically.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Next.js 16 App Router                                    │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Three-pane workspace shell (/) — client component  │  │
│  │  ┌───────────┐ ┌────────────┐ ┌──────────────────┐  │  │
│  │  │ PdfViewer │ │  ChatUI    │ │  RedFlagReport   │  │  │
│  │  │ react-pdf │ │ streaming  │ │ severity + cite  │  │  │
│  │  └─────┬─────┘ └─────┬──────┘ └────────┬─────────┘  │  │
│  └────────┼─────────────┼──────────────────┼───────────┘  │
│           │             │                  │              │
│   POST /api/leases  POST /api/chat    GET /api/leases/[id]│
│   (multipart PDF →  (NDJSON stream    (clauses + draft    │
│   parse + segment   + tool-use loop,  emails for the      │
│   + classify)       max 3 iters)      report panel)       │
└──────────────────────┬───────────────────────────────────┘
                       │
        ┌──────────────▼───────────────────────────────┐
        │  ToolRegistry  (RBAC-filtered, audited)       │
        │  Read-only:  search_corpus                    │
        │              get_document_summary             │
        │              list_documents (Admin)           │
        │              extract_clauses                  │
        │              grade_clause_severity            │
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

**Audit + rollback invariants.** `draft_negotiation_email` is the single mutating tool. The Anthropic `messages.create` call runs in an async `prepare` step *before* the transaction, so the SQLite write window is short. The transaction wraps the `negotiation_emails` insert and the `audit_log` insert — if either fails, both roll back. The `ToolCard` UI renders an Undo button; clicking it runs `POST /api/audit/[id]/rollback`, which executes the compensating action (`DELETE FROM negotiation_emails WHERE id = ?`) and updates the audit row's status atomically.

**Custom MCP server** at [`mcp/leaselens-server.ts`](mcp/leaselens-server.ts) exposes the registry over stdio for Claude Desktop, Cursor, or any MCP client.

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
git clone git@github.com:jar285/ContentOps.git
cd ContentOps
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

The home page opens with a three-pane workspace: PDF viewer on the left, chat in the middle, red-flag report on the right. The default workspace is the seeded sample, so you have a lease to inspect immediately.

### As Tenant (default role)

The Tenant sees only leases they uploaded. The full lease toolset is available — `extract_clauses`, `grade_clause_severity`, `draft_negotiation_email` — plus read-only corpus search.

Try, in this order:

- *"Run the standard scan."* — the assistant calls `extract_clauses`, then `grade_clause_severity` for each non-trivial clause in turn. The right-hand red-flag report fills in as gradings come back; each card shows the severity, a NJ statute citation, the assistant's plain-English reasoning, and a recommended action. Click a citation chip to scroll the PDF viewer to the cited clause.
- *"What does NJ law say about security-deposit caps?"* — direct corpus search via `search_corpus`. Every answer is grounded in retrieved chunks.
- *"Draft a polite email to my landlord about the security deposit clause."* — the assistant calls `draft_negotiation_email` with the most-recent grading's reasoning + statute citation as context. The result renders inline as a `ToolCard` with an Undo button.

### As Reviewer / Admin

Reviewer (DB literal `Editor`) and Admin see every lease in the workspace, not just their own uploads. Admin additionally sees the full audit log — including MCP-originated mutations — and `list_documents` for corpus inventory.

Open `/cockpit` (Reviewer or Admin only) for the operator dashboard: today's spend vs the daily ceiling, the audit feed, scheduled negotiation emails, and a two-tier eval-health panel showing the most recent Tier 1 + Tier 2 runs side-by-side.

> **About negotiation emails:** the `draft_negotiation_email` tool writes a SQLite row — it does **not** send the email anywhere. The artifact is a JSON record in the audit trail. A production deployment would integrate the same audit pattern with a real SMTP/Mailgun backend.

### Switching workspaces

Click the workspace label in the header to open the switcher. From there you can use the seeded sample, drag in your own lease PDF, or jump back to a previously-uploaded one. Each upload TTLs after 24 hours via lazy cleanup on the next upload.

---

## Features

### Role-Based Access (Tenant / Reviewer / Admin)

| Role (UI) | DB literal | Tools available | Lease ownership |
|---|---|---|---|
| Tenant | `Creator` | `search_corpus`, `extract_clauses`, `grade_clause_severity`, `draft_negotiation_email`, `render_workflow_diagram` | Only leases the user uploaded |
| Reviewer | `Editor` | + `get_document_summary` | All leases in workspace |
| Admin | `Admin` | + `list_documents` | All leases + full audit log |

The same registry that filters the prompt's tool manifest also gates execution — if a role can't see a tool in its manifest, it can't invoke it at runtime. Lease ownership is a second axis enforced by `assertLeaseOwnership(lease, ctx)`, called inside every lease tool and the `GET /api/leases/[id]` route guard.

### Citation-Grounded Severity Grading

`grade_clause_severity` retrieves NJ tenant-law chunks for a clause, asks the model to grade severity (`high` / `medium` / `low` / `ok`) and cite a chunk + statute, and validates both before returning. The validator throws if the cited `chunk_id` is not in the retrieved set, or if the `statute_citation` string does not appear inside that chunk's text. The Tier 1 eval enforces a ≥ 0.90 groundedness rate in CI.

### Auditable Mutations + Undo

`draft_negotiation_email` is the only mutating tool. The async LLM call runs in a `prepare` step *before* the SQLite transaction; the transaction wraps the `negotiation_emails` insert and the audit-row insert atomically. The `ToolCard` UI renders an Undo button; `POST /api/audit/[id]/rollback` runs the compensating action (`DELETE FROM negotiation_emails WHERE id = ?`) and the status flip in one transaction. Idempotent on already-rolled-back rows.

### Operator Cockpit

`/cockpit` (Reviewer + Admin) shows recent audited actions, scheduled negotiation emails, today's demo spend, and a two-tier eval-health panel. The eval panel renders Tier 1 (retrieval) and Tier 2 (lease grading) side-by-side with a 6-metric grid so you can see retrieval quality and end-to-end accuracy at a glance.

### PDF Pipeline

`POST /api/leases` accepts a `application/pdf` upload (max 1 MB, max 30 pages by default). The route runs `parsePdf(buffer)` from [`src/lib/lease/parse-pdf.ts`](src/lib/lease/parse-pdf.ts) using `pdfjs-dist`, segments each page on numbered-section prefixes (`1.`, `(a)`, `ARTICLE I`), classifies each clause by type (security_deposit, late_fee, early_termination, …), and inserts into `leases` / `clauses`. Scanned PDFs with no text layer return 422 with `error: 'pdf_no_text_layer'` — OCR is out of scope. The client viewer is `react-pdf` over the same `pdfjs-dist`, with a citation-chip hook that scrolls to the cited page.

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
      "cwd": "/path/to/ContentOps"
    }
  }
}
```

MCP-originated mutations produce audit rows attributed to actor `mcp-server` inside the sample workspace.

### Diagrams (Mermaid)

`render_workflow_diagram` accepts raw Mermaid source for any of eight diagram families (`flowchart`, `graph`, `sequenceDiagram`, `stateDiagram-v2`, `mindmap`, `journey`, `classDiagram`, `erDiagram`). Server-side validation only (prefix regex, length cap, init-directive + line-comment skip); rendering happens client-side via `mermaid@^11` with `securityLevel: 'strict'` and `htmlLabels: false`. Parse errors fall back to a `<pre>` block of the raw code with the error inline.

The diagram entry, assistant message entry, and `ToolCard` expand/collapse are animated via `motion@^12`. All three surfaces honour `prefers-reduced-motion`: when set, animations are skipped entirely (not slowed) and the DOM renders the plain equivalents. The `mermaid` bundle is dynamic-imported, so the cost is paid only on the first render.

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
ContentOps/
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
│   │   │   ├── chat/route.ts             # NDJSON streaming + tool-use loop (max 3 iters)
│   │   │   ├── leases/                   # POST upload + GET [id] + clauses/emails
│   │   │   ├── audit/                    # GET role-filtered list, POST [id]/rollback
│   │   │   └── workspaces/               # multipart upload + select-sample
│   │   ├── cockpit/                      # /cockpit dashboard (Reviewer + Admin)
│   │   └── page.tsx                      # Home — three-pane workspace shell
│   ├── components/
│   │   ├── chat/                         # ChatUI, ChatMessage, ToolCard, MermaidDiagram
│   │   ├── cockpit/                      # AuditFeed, Schedule, Spend, EvalHealth panels
│   │   ├── lease/                        # PdfViewer, RedFlagReport, CitationChip, dropzone
│   │   └── workspaces/                   # workspace switcher + onboarding
│   ├── corpus/
│   │   ├── nj-tenant-law/                # 28 NJ tenant-law markdown sources
│   │   └── sample-lease/                 # seeded sample lease PDF + markdown
│   ├── db/
│   │   └── seed.ts                       # idempotent seed (corpus + sample lease)
│   └── lib/
│       ├── anthropic/                    # SDK singleton + E2E mock
│       ├── auth/                         # session, RBAC types, demo users, role labels
│       ├── chat/                         # system-prompt, context-window, conversations, parse-stream-line
│       ├── db/                           # schema, migrate, spend, rate-limit
│       ├── evals/                        # Tier 1 runner, Tier 2 runner, golden + lease cases
│       ├── lease/                        # parse-pdf, segment-clauses, classify-clause,
│       │                                 # validate-upload, queries, ownership, disclaimer
│       ├── rag/                          # ingest, chunk, embed (Xenova WASM), retrieve
│       ├── tools/                        # registry, lease-tools, corpus-tools, diagram-tools,
│       │                                 # audit-log, create-registry
│       └── workspaces/                   # cookie helpers + per-visitor brand list
└── docs/
    ├── _meta/                            # charter, guidelines, architecture snapshot
    └── _specs/sprint-13-leaselens/       # spec, sprint plan, impl-qa
```

---

## Sprint History

LeaseLens is built sprint-by-sprint with a spec → QA → sprint plan → implementation → QA loop. All artifacts live in [`docs/_specs/`](docs/_specs/).

Sprints 0–12 shipped the original ContentOps cockpit (the same registry / RAG / audit / eval infrastructure under a media-brand framing). Sprint 13 pivoted the corpus and tool surface to NJ residential leases while preserving every architectural invariant. Sprint 14 hardened the eval harness with Tier 2 lease grading, cleared lint, and shipped the cockpit two-tier display. Sprint 16 will deliver the Vercel deployment and a 90-second Loom walkthrough.

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
| 15 | Polish backlog (paste-text fallback, in-app Tier 2 button, sample-lease CTA) | Planned |
| 16 | Vercel deployment + README polish + Loom | Planned |

---

## License

ISC
