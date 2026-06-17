# LeaseLens

https://github.com/user-attachments/assets/7664c2cb-fba1-4816-bbb7-a17e5b098a5a

**LeaseLens is a NJ residential lease red-flag reviewer.**

Drop in a lease PDF, get clause-by-clause severity grading grounded in NJ tenant-law sources, then ask the assistant to explain clauses in plain English or draft a polite negotiation email.

LeaseLens is built to demonstrate how an LLM agent can handle high-stakes domain judgment under real engineering constraints:

- Hybrid RAG against a curated NJ tenant-law corpus
- Citation-grounded clause grading
- Parser-first PDF workflow
- Evidence highlighting inside the PDF viewer
- Tool-use loop with auditability
- Role-aware tool access
- Deterministic evals in CI

> **Not legal advice.** LeaseLens reviews NJ residential leases and grades clauses against NJ tenant-law sources. It is not a lawyer, and its output is not legal advice. Before acting on any clause grading or draft email, consult a tenant attorney or local NJ legal-aid clinic.

---

## Status

LeaseLens currently runs end-to-end locally.

Current public product direction:

```text
v1.0
```

Production hardening roadmap:

- Public Vercel deployment
- Hosted database, such as libSQL / Turso or Postgres
- Real authentication
- Per-user data isolation
- Cost and rate caps
- Loom walkthrough

---

## Quick Start

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

Set the required environment variables:

```env
ANTHROPIC_API_KEY=sk-ant-...
LEASELENS_SESSION_SECRET=<32+ chars>
LEASELENS_DB_PATH=./data/leaselens.db
LEASELENS_DEMO_MODE=false
LEASELENS_ANTHROPIC_MODEL=claude-haiku-4-5
LEASELENS_DAILY_SPEND_CEILING_USD=2
LEASELENS_LEASE_MAX_BYTES=1048576
LEASELENS_LEASE_MAX_PAGES=30
LEASELENS_AUTO_SCAN_ENABLED=true
LEASELENS_LOG_LEVEL=info
```

### 3. Start the dev server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

The first `npm run dev` automatically seeds the database through `predev`.

The seed process:

- Ingests the 28-document NJ tenant-law corpus
- Generates embeddings locally through WASM
- Copies a sample NJ residential lease into the local database
- Lets reviewers try the workflow without uploading a file

Manual seed command:

```bash
npm run db:seed
```

The seed script is idempotent and skips work when chunks are already populated.

---

## What LeaseLens Does

LeaseLens follows a parser-first workflow:

```text
Upload lease → Parse clauses → Grade severity → Show red flags → Highlight evidence → Ask assistant
```

The core product experience has two modes:

### Mode A — No Lease Uploaded

The user sees a landing screen with:

- Hero dropzone
- Five-step flow
- Trust metrics
- Clear upload action

### Mode B — Lease Uploaded

The user sees a two-column workspace:

- **Left:** PDF viewer
- **Right:** red flags, clauses, citations, and actions
- **Bottom-right:** floating assistant drawer

The assistant supports follow-up questions, plain-English explanations, and negotiation email drafts without taking over the main parser-first experience.

---

## Why This Project Matters

Most chat demos avoid serious domains because grounding is difficult.

LeaseLens leans into a serious domain:

```text
NJ residential tenant law
```

The system is designed so the model cannot casually invent legal claims.

Key safeguards:

- The model must cite retrieved NJ tenant-law corpus chunks.
- `grade_clause_severity` validates both the cited `chunk_id` and statute text.
- Failed citation grounding throws instead of silently returning.
- Mutating actions are written to an audit trail.
- Evaluation runs measure retrieval and grading quality.
- Lease PDFs are parsed as user input, not embedded into the legal corpus.

The goal is not only to integrate an LLM.

The goal is to show product judgment, grounding discipline, UX clarity, and engineering reliability in one applied AI product.

---

## What This Project Demonstrates

### 1. LLM + Agent + RAG Composition

LeaseLens uses:

- Anthropic streaming chat
- A 15-iteration tool-use loop
- Hybrid retrieval with vector search, BM25, and reciprocal-rank fusion
- A curated 28-document NJ tenant-law corpus
- Lease-specific tools exposed through a role-filtered registry

### 2. Citation Discipline

`grade_clause_severity` validates that:

- The cited `chunk_id` exists in the retrieved set.
- The cited statute string appears inside the cited chunk.

If validation fails, the tool throws.

This forces the assistant to retry or admit that it cannot ground the claim.

### 3. Two-Tier Evaluation

LeaseLens includes two evaluation tiers:

| Tier | Measures | Command |
|---|---|---|
| Tier 1 | Retrieval quality: Precision@K, Recall@K, MRR, Groundedness | `npm run eval:golden` |
| Tier 2 | End-to-end lease clause severity grading | `npm run eval:leases` |

Tier 1 is hermetic and makes no LLM calls.

Tier 2 calls Anthropic and should be gated by spend limits before running on every PR.

### 4. Engineering Constraints

LeaseLens includes:

- Role-based tool filtering
- Lease ownership checks
- SQLite transactions for mutating actions
- Audit log entries for every mutation
- Operator-only rollback for auditable mutations
- CI checks for lint, typecheck, tests, build, and e2e

### 5. PDF Evidence Highlighting

Every red-flagged clause can be highlighted directly inside the PDF viewer.

The user can move from:

```text
Red flag card → exact PDF text → explanation → recommended action
```

This turns a severity grade into visible evidence.

---

## Architecture Overview

```text
Next.js App Router
│
├── Parser-first workspace
│   ├── Mode A: Lease upload landing
│   └── Mode B: PDF viewer + red-flag results
│
├── Floating AssistantFab
│   ├── Plain-English explanations
│   ├── Clause-specific follow-ups
│   └── Negotiation email drafting
│
├── API routes
│   ├── /api/leases
│   ├── /api/chat
│   ├── /api/audit
│   └── /api/workspaces
│
├── ToolRegistry
│   ├── search_corpus
│   ├── extract_clauses
│   ├── grade_clause_severity
│   ├── get_lease_findings
│   ├── draft_negotiation_email
│   └── render_workflow_diagram
│
├── SQLite
│   ├── users
│   ├── sessions
│   ├── documents / chunks
│   ├── leases / clauses
│   ├── negotiation_emails
│   └── audit_log
│
├── RAG pipeline
│   ├── Ingest
│   ├── Chunk
│   ├── Embed
│   └── Retrieve
│
└── Lease pipeline
    ├── parsePdf
    ├── segmentClauses
    ├── classifyClause
    └── store clauses
```

---

## Core Architecture Notes

### Corpus vs. Lease Input

LeaseLens keeps a strict separation between:

| Type | Stored In | Purpose |
|---|---|---|
| NJ tenant-law corpus | `documents` / `chunks` | Legal grounding |
| Uploaded lease PDFs | `leases` / `clauses` | User input and review target |

Lease PDFs are **never embedded into the RAG index**.

This keeps retrieval grounding pointed at NJ tenant-law sources, not the user's uploaded document.

---

### Citation Grounding

`grade_clause_severity` works as follows:

1. Retrieve relevant NJ tenant-law chunks.
2. Ask the model to grade the lease clause.
3. Require the model to return a `chunk_id` and `statute_citation`.
4. Validate both before returning.

The validator throws when:

- The cited `chunk_id` is not in the retrieved set.
- The cited statute text does not appear in the cited chunk.

---

### Audit Invariants

`draft_negotiation_email` is the only mutating tool.

Its flow is intentionally split:

1. The LLM prepares the email draft.
2. SQLite opens a short transaction.
3. The transaction inserts the negotiation email.
4. The transaction inserts the audit-log row.
5. If either insert fails, both roll back.

Tenant users see a copy-to-clipboard card.

Reviewer/Admin users can access operator rollback through the audit flow.

---

### PDF Evidence Highlighting

LeaseLens highlights graded clauses directly on the rendered PDF.

Implementation notes:

- Uses `react-pdf` text-layer rendering.
- Uses a client-side matcher in `highlight-match.ts`.
- Does not store coordinates.
- Does not require schema changes.
- Highlights realign on zoom and scroll.
- Passive marks stay soft.
- Active clauses get an evidence frame, halo, glow, and floating concern label.
- Gutter markers help users scan long leases.
- Severity is not communicated by color alone.
- Motion respects `prefers-reduced-motion`.

---

### Observability

Sprint 44 introduced a reliability layer:

- Structured `pino` logger
- Request correlation IDs
- Accessible error boundaries
- PII-redaction allowlist
- CI workflow for lint, typecheck, tests, and build
- Separate Playwright e2e job

Raw lease text, clause text, and draft-email bodies should not reach logs or persisted tool-call error messages.

---

## Screenshots

<img width="1439" height="717" alt="LeaseLens screenshot" src="https://github.com/user-attachments/assets/30f53823-8a1d-49db-b55c-3a51c49332b0" />

<img width="2048" height="1014" alt="LeaseLens evidence highlighting screenshot" src="https://github.com/user-attachments/assets/6480d62c-4e2c-4742-8c74-ac4598598d23" />

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router, React 19 |
| Language | TypeScript strict mode |
| Styling | Tailwind CSS 4 |
| Database | SQLite via `better-sqlite3`, WAL mode |
| LLM | Anthropic Claude, `claude-haiku-4-5` default |
| Embeddings | `@huggingface/transformers`, WASM, local |
| PDF | `pdfjs-dist` and `react-pdf` |
| Diagrams | `mermaid@^11` |
| Animation | `motion@^12` |
| MCP | `@modelcontextprotocol/sdk` |
| Testing | Vitest 4 and Playwright |
| Linting | Biome |
| Validation | Zod 3 |

---

## Trying the Product

The seeded sample lease loads automatically on the first `npm run dev`.

### Suggested First Flow

1. Open the app.
2. Use the seeded sample lease or upload a text-layer NJ lease PDF.
3. Run the standard scan.
4. Review the red-flag cards.
5. Click a citation or **View on page** action.
6. Verify the PDF evidence highlight.
7. Open the AssistantFab.
8. Ask for a plain-English explanation.
9. Draft a negotiation email.

---

## Suggested Prompts

### Standard Scan

```text
Run the standard scan on this lease.
```

```text
Which clause is the most concerning, and why?
```

```text
Show me only the high-severity red flags.
```

### Clause-Specific Questions

```text
Read the security-deposit clause and tell me if it is enforceable under NJ law.
```

```text
Is the late fee in this lease legal? Quote the section that talks about it.
```

```text
What does the lease say about early termination, and what is NJ law's position?
```

```text
Compare the attorney's-fees clause to NJ statute. Is it one-way or reciprocal?
```

### Direct Corpus Questions

```text
How much can a NJ landlord legally charge for a security deposit, and is interest required?
```

```text
What notice does a NJ landlord have to give before entering the apartment?
```

```text
Cite the NJ statute on retaliation against a tenant who reports code violations.
```

### Negotiation Drafting

```text
Draft a polite email to my landlord about the security deposit clause.
```

```text
Draft a firmer email about the late-fee structure.
```

```text
Use a formal tone and request a redline of the early-termination clause.
```

---

## Test Lease Guidance

The seeded sample lease is located at:

```text
src/corpus/sample-lease/sample-nj-residential-lease.pdf
```

Supported upload type:

```text
Text-layer NJ residential lease PDF
≤ 1 MB
≤ 30 pages
```

Avoid:

- Scanned-image PDFs
- Commercial leases
- Leases from other states
- Real personal leases with sensitive information

Scanned PDFs without a text layer return:

```text
422 pdf_no_text_layer
```

OCR is currently out of scope.

---

## Roles

> In the running public app today, everyone is a Tenant. The role switcher is only available in demo mode.

| Role | DB Literal | Tools | Lease Access |
|---|---|---|---|
| Tenant | `Creator` | `search_corpus`, `extract_clauses`, `grade_clause_severity`, `get_lease_findings`, `draft_negotiation_email`, `render_workflow_diagram` | Own uploaded leases only |
| Reviewer | `Editor` | Tenant tools + `get_document_summary` | All leases in workspace |
| Admin | `Admin` | Reviewer tools + `list_documents` | All leases + audit log |

Role access is enforced twice:

1. The registry filters the visible tool manifest.
2. Tool execution re-checks permissions and lease ownership.

---

## Features

### Parser-First Lease Review

The main product is the PDF parser and red-flag report.

The assistant is supportive, not primary.

### Citation-Grounded Severity Grading

Every severity grade must connect to a retrieved NJ tenant-law source.

### PDF Evidence Highlighting

Red-flagged clauses are highlighted directly on the PDF, with active evidence framing and gutter markers.

### Floating AssistantFab

The assistant drawer preserves draft and thread state across close/open cycles.

### Plain-English Explanations

Red-flag cards include a plain-English action for tenant-friendly explanations.

### Negotiation Email Drafting

The assistant can draft a negotiation email using clause grading and statute context.

### Auditable Mutations

Drafted negotiation emails are written to SQLite and paired with an audit row.

### Operator Cockpit

Reviewer/Admin users can inspect audit activity, spend, scheduled emails, and eval health.

### MCP Server

The tool registry is exposed over Model Context Protocol through stdio.

### Mermaid Diagrams

`render_workflow_diagram` can render supported Mermaid diagram types safely on the client.

### Observability and CI

Structured logs, correlation IDs, error boundaries, and PR checks support production readiness.

---

## Running Tests

```bash
# Unit + integration + contract tests
npm run test

# E2E smoke specs
npm run test:e2e

# Type checking
npm run typecheck

# Linting
npm run lint

# Tier 1 retrieval eval
npm run eval:golden

# Tier 2 lease-grading eval
npm run eval:leases

# Production build
npm run build
```

Playwright runs with:

```text
LEASELENS_E2E_MOCK=1
```

This swaps Anthropic for a deterministic mock during e2e tests.

---

## MCP Server

Start the LeaseLens MCP server:

```bash
npm run mcp:server
```

Example MCP config:

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

MCP-originated mutations produce audit rows attributed to:

```text
mcp-server
```

---

## Browser-Control MCP

The repo also includes a project-level `.mcp.json` for Microsoft's Playwright MCP server.

With `npm run dev` running, an MCP-aware client can:

- Navigate the local app
- Take accessibility snapshots
- Click and type
- Capture screenshots
- Verify UI changes interactively

`npm run test:e2e` remains the source of truth for regression coverage.

---

## Project Structure

```text
LeaseLens/
├── mcp/                     # MCP server
├── scripts/                 # evals, seeding, PDF worker copy
├── tests/e2e/               # Playwright specs
├── src/
│   ├── app/                 # Next.js routes and pages
│   ├── components/          # UI components
│   │   ├── chat/            # AssistantFab and chat UI
│   │   ├── cockpit/         # Operator dashboard
│   │   ├── layout/          # Shell, footer, motion provider
│   │   └── lease/           # Parser, PDF viewer, red flags, highlights
│   ├── corpus/              # NJ tenant-law corpus and sample lease
│   ├── db/                  # Seed and database setup
│   └── lib/                 # Auth, RAG, tools, lease logic, logging
├── design-system/           # Design-system documentation
└── docs/
    ├── _architecture/       # Philosophy and architecture notes
    ├── _meta/               # Charter, guidelines, snapshots
    └── _specs/              # Per-sprint specs and implementation QA
```

---

## Sprint History

LeaseLens is built sprint-by-sprint using the project workflow:

```text
Spec → QA → Sprint Plan → Implementation → QA
```

Phase summary:

| Phase | Sprints | Focus |
|---|---:|---|
| Platform foundation | 0–12 | Tool registry, RAG, audit log, eval harness, MCP |
| LeaseLens pivot | 13–14 | NJ lease corpus, lease tools, Tier 2 eval |
| Design system + tenant UX | 15–25 | Tailwind tokens, typography, editorial brand, PDF controls |
| Parser-first workspace | 26–33 | Mode A/B router, AssistantFab, persistence, bug triage |
| Grounding + clarity | 34–35 | Citation recovery and plain-English explanations |
| Assistant polish + platform | 36–45 | Concierge surfaces, content pages, motion, observability, findings reuse |
| Evidence highlighting + brand | 46–50 | PDF evidence layer, gutter markers, `v1.0` polish, Mode B depth + verdict moment |

Full sprint history:
 
[History](docs/history.md)

---

## License

MIT
