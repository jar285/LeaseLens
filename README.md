# ContentOps

An AI operator cockpit for onboarding a media brand into an AI-assisted content operations workflow. Built to demonstrate how LLMs, RAG, MCP tools, and structured engineering practices (RBAC, eval harnesses, audit-ready architecture) compose into a production-grade system — not just a chatbot.

**Demo brand:** Side Quest Syndicate — a fictional tabletop and board game media brand used as the seeded corpus throughout the project.

**Deployment status:** local demo is implemented; public Vercel deployment and Loom walkthrough are planned for the final closeout sprint.

---

## Why This Fits AI Product Engineering

ContentOps is built around the kind of internal AI workflow Doing Things describes: reducing repetitive media-operations work while keeping human judgment, role permissions, and rollback controls visible. The demo shows how a content team can ask grounded brand questions, search onboarding materials, schedule content, approve drafts, inspect audit history, and monitor eval/spend health from one working product surface.

The project emphasizes product judgment as much as model integration: every AI action is tied to an operator role, every mutation is auditable and undoable, and retrieval quality is measured with a deterministic eval harness rather than assumed.

---

## What This Project Demonstrates

This project is a portfolio piece targeting Forward Deployed, AI Product, and Applied AI engineering roles. It demonstrates, in order of priority:

1. **Full-stack TypeScript delivery** — Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, SQLite, end-to-end from schema to streaming UI.
2. **LLM + RAG + Tool composition** — Anthropic streaming chat, hybrid retrieval (vector + BM25 + reciprocal rank fusion), and an RBAC-aware tool registry wired into the Anthropic tool-use loop — not isolated API calls.
3. **AI evaluation** — A deterministic golden eval harness measuring retrieval quality (Precision@K, Recall@K, MRR, Groundedness) against a curated golden set. It exits 0/1 and writes a machine-readable report for the cockpit.
4. **Engineering constraints** — Role-based access control (Creator / Editor / Admin) enforced in middleware, at the API layer, and in the tool registry. The same registry that filters the prompt's tool manifest also enforces execution — prompt claims and runtime behavior cannot drift apart.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Next.js 16 App Router                                │
│  ┌──────────────┐   ┌────────────────────────────┐    │
│  │  Chat UI     │   │  /api/chat (POST)           │    │
│  │  (streaming) │◄──│  Anthropic tool-use loop    │    │
│  │  ToolCard +  │   │  (max 3 iters)              │    │
│  │  Undo button │   └──────────┬─────────────────┘    │
│  └──────────────┘              │                       │
│  ┌─────────────────────────────▼──────────────────┐    │
│  │  /api/audit (GET)        — RBAC-filtered list  │    │
│  │  /api/audit/[id]/rollback (POST) — atomic undo │    │
│  └─────────────────────────────┬──────────────────┘    │
└────────────────────────────────┼───────────────────────┘
                                 │
            ┌────────────────────▼─────────────────────┐
            │  ToolRegistry (RBAC-filtered, audited)   │
            │  Read-only:  search_corpus               │
            │              get_document_summary        │
            │              list_documents              │
            │  Mutating:   schedule_content_item       │
            │              approve_draft               │
            │  Mutating tools execute in a sync        │
            │  better-sqlite3 transaction with a       │
            │  paired audit_log row insert.            │
            └────────────────────┬─────────────────────┘
                                 │
        ┌────────────────────────▼────────────────────────┐
        │  SQLite (better-sqlite3)                         │
        │  users · sessions · conversations · messages     │
        │  documents · chunks                              │
        │  audit_log · content_calendar · approvals        │
        └────────────────────────┬────────────────────────┘
                                 │
            ┌────────────────────▼────────────────────┐
            │  RAG Pipeline                            │
            │  Ingest → Chunk → Embed (WASM)           │
            │  Retrieve: vector + BM25 + RRF           │
            └──────────────────────────────────────────┘
```

**Custom MCP server** at `mcp/contentops-server.ts` exposes all 5 tools (3 read-only + 2 mutating) over stdio transport — consumable by Claude Desktop, Cursor, or any MCP client. Mutating MCP calls produce audit rows attributed to actor `mcp-server`.

**Audit + rollback invariants.** Every successful mutating-tool call writes one `audit_log` row inside the same SQLite transaction as the mutation — if either write fails, both roll back. The `ToolCard` UI renders an Undo button for mutating-tool results; clicking it issues `POST /api/audit/[id]/rollback`, which runs the descriptor's compensating action and updates the audit row's status atomically. Admins see the full audit log; non-admins see only their own entries.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 4 |
| Database | SQLite via `better-sqlite3` |
| LLM | Anthropic Claude (`claude-haiku-4-5` default) |
| Embeddings | `@huggingface/transformers` (WASM, local, no API key) |
| MCP | `@modelcontextprotocol/sdk` (stdio transport) |
| Testing (unit + integration) | Vitest 4 |
| Testing (E2E) | `@playwright/test` |
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
ANTHROPIC_API_KEY=sk-ant-...          # required — your Anthropic API key
CONTENTOPS_SESSION_SECRET=<32+ chars> # required — any random string ≥ 32 characters
CONTENTOPS_DB_PATH=./data/contentops.db
CONTENTOPS_DEMO_MODE=false
CONTENTOPS_ANTHROPIC_MODEL=claude-haiku-4-5
CONTENTOPS_DAILY_SPEND_CEILING_USD=2
```

### 3. Seed the database

This ingests the Side Quest Syndicate corpus (5 markdown documents), chunks them, and generates embeddings locally via WASM. Takes ~30 seconds on first run.

```bash
npm run db:seed
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Trying It Out

The chat at `/` opens grounded in the seeded Side Quest Syndicate brand. Switch roles via the bottom-right role switcher — each role unlocks a different tool surface and tells a different operator story.

### As Creator (default role)

Read-only. The assistant can search the brand corpus explicitly via `search_corpus` and ground every answer in retrieved chunks. No mutations possible.

Try:

- *"What is Side Quest Syndicate's brand voice?"*
- *"Summarize our content pillars in three sentences."*
- *"What does our audience profile say about target reader age?"*
- *"Walk me through our editorial style guide for headlines."*

What to notice: every answer is grounded in retrieved chunks (the assistant doesn't invent brand specifics). The composer offers no scheduling or approval affordances.

### As Editor

Adds inspect-and-act capabilities: `get_document_summary` and `schedule_content_item`. Editors can read deeper into documents and queue items onto the content calendar.

Try:

- *"Give me a summary of the brand-identity document."*
- *"Schedule a Twitter post for tomorrow at 2pm about our new content-calendar doc."*
- *"Plan three calendar items across Twitter, newsletter, and blog for next week."*

What to notice: each `schedule_content_item` call writes an `audit_log` row AND a `content_calendar` row in one transaction. The ToolCard renders with an **Undo** button. Open `/cockpit` → the Schedule panel shows your queued items. Click Undo on the chat bubble → the calendar row vanishes and the audit row's status flips to `rolled_back`.

> **About scheduling:** the `schedule_content_item` tool writes a local SQLite row — it does **not** publish to Twitter, a CMS, or any external destination. The feature exists to demonstrate the auditable-mutation + rollback pattern (every state-changing AI action is logged, reversible, and role-gated). A production deployment would integrate the same audit pattern with real publishing backends.

### As Admin

Full operator role: adds `list_documents` and `approve_draft`, plus full audit-log visibility. Admins see and can roll back anyone's actions.

Try:

- *"List every document in the corpus with its slug and a one-line summary."*
- *"Approve the latest scheduled blog post."*
- *"Show me what's been scheduled in the last 24 hours."* (then open `/cockpit` → Audit panel)

What to notice: same audit/rollback pattern as Editor, but cross-actor. The cockpit's Audit panel shows rows from every actor (Editor, Admin, even MCP-originated). Click Undo on someone else's mutation — it works (Admin override). Approval rows live in their own table and surface in the cockpit's Approvals panel.

### Switching brands

The default workspace is Side Quest Syndicate. Click the workspace label in the header (next to "ContentOps Studio") to open the switcher. From there you can:

- **Use sample brand** — return to Side Quest.
- **Start a new brand…** — drag-and-drop your own markdown files (up to 5, ≤100KB each), or click to choose. The assistant grounds its answers in your uploaded brand instead. The chat thread resets so prior-brand questions don't bleed across.
- **Switch to a previously-uploaded brand** — your browser remembers every brand you've uploaded in this session; click any of them in the menu to flip the active workspace. (The list is per-cookie, so each visitor only sees their own uploads.)

For a quick test with content the model definitely wasn't trained on as your specific brand corpus, grab a few markdown sections from the [GitLab Handbook](https://gitlab.com/gitlab-com/content-sites/handbook/-/tree/main/content/handbook), save them locally, and upload via the brand-switcher. Then ask brand-specific questions and watch retrieval grounding work on a real brand's voice.

---

## Features

### Role-Based Access (Creator / Editor / Admin)

Use the role switcher in the top-right corner of the chat UI. Each role unlocks different capabilities:

| Role | Tools available | Access |
|------|----------------|--------|
| Creator | `search_corpus` | Ask the AI to search the brand corpus explicitly |
| Editor | + `get_document_summary`, `schedule_content_item` | Inspect documents, queue items to the calendar table (auditable + reversible — see *Trying It Out* for the no-real-publishing caveat) |
| Admin | + `list_documents`, `approve_draft` | Full corpus inventory, draft approvals, full audit-log visibility |

The same registry that filters the prompt's tool manifest also gates execution — if a role can't see a tool in its manifest, it can't invoke it at runtime.

### Mutating Tools, Audit, and Undo

`schedule_content_item` (Editor + Admin) and `approve_draft` (Admin only) write SQLite rows transactionally. Each successful mutation produces an `audit_log` row with a serializable compensating-action payload. The `ToolCard` UI renders an **Undo** button next to mutating-tool results; clicking it runs the compensating action and the audit-row status update atomically. Read-only tools produce no audit row and no Undo button.

- `GET /api/audit` — Admin sees all rows; non-admins see only their own.
- `POST /api/audit/[id]/rollback` — audit-ownership policy: Admin can roll back any row; non-admins only their own. Idempotent on already-rolled-back rows.

### Operator Cockpit

Editors and Admins can open `/cockpit` from the header. The cockpit shows recent audited actions, scheduled content, approval history for Admins, today's demo spend, and the latest golden-eval health report. Panels use page-load state plus manual refresh, keeping the demo simple while still showing the operating surface behind the chat.

### Chat + RAG

The chat interface at `/` provides grounded answers about the Side Quest Syndicate brand. The assistant combines:
- **Implicit RAG** — automatic hybrid retrieval (vector + BM25 + RRF) injected as context on every turn.
- **Explicit tool calls** — the assistant can invoke `search_corpus` mid-conversation when the user's query warrants a fresh search.

### MCP Server

All 5 tools (3 read-only + 2 mutating) are exposed over the Model Context Protocol for use in Claude Desktop, Cursor, or any MCP-compatible client. MCP-originated mutations produce audit rows attributed to actor `mcp-server`:

```bash
npm run mcp:server
```

Add to your MCP client config:
```json
{
  "mcpServers": {
    "contentops": {
      "command": "npx",
      "args": ["tsx", "mcp/contentops-server.ts"],
      "cwd": "/path/to/ContentOps"
    }
  }
}
```

---

## Running the Tests

```bash
# Unit + integration + contract tests
npm run test

# E2E smoke specs (Playwright; auto-launches dev server with the Anthropic mock)
npm run test:e2e

# Type checking
npm run typecheck

# Linting
npm run lint

# Golden retrieval eval (deterministic, exits 0/1, writes data/eval-reports/)
npm run eval:golden

# Production build check
npm run build
```

### What the tests cover

| Area | Files | Count |
|------|-------|-------|
| Tool Registry (RBAC, dispatch, audit hook, validation throw) | `src/lib/tools/registry.test.ts` | 11 |
| Mutating tools (schedule + approve, idempotent rollback, ISO validation) | `src/lib/tools/mutating-tools.test.ts` | 5 |
| Audit-log helpers (round-trip, idempotent mark, RBAC filter) | `src/lib/tools/audit-log.test.ts` | 3 |
| `GET /api/audit` (RBAC filtering, no-cookie default) | `src/app/api/audit/route.integration.test.ts` | 3 |
| `POST /api/audit/[id]/rollback` (atomic compensating action, idempotent, throw → status preserved) | `src/app/api/audit/[id]/rollback/route.integration.test.ts` | 4 |
| Corpus tools (search, summary, list) | `src/lib/tools/corpus-tools.test.ts` | 4 |
| RAG retrieval pipeline | `src/lib/rag/*.test.ts` | ~20 |
| Chat route (streaming, tool-use loop) | `src/app/api/chat/route.integration.test.ts` | ~10 |
| Auth, sessions, middleware | `src/lib/auth/*.test.ts`, `src/middleware.test.ts` | ~20 |
| DB schema and helpers | `src/lib/db/*.test.ts` | ~10 |
| Eval scoring + runner | `src/lib/evals/*.test.ts` | 9 |
| MCP contract (read-only + mutating-tool parity) | `mcp/contentops-server.test.ts` | 6 |
| UI components | `src/app/page.test.tsx` | ~25 |
| **E2E smoke** — chat → tool_use → ToolCard → Undo, cockpit dashboard smoke (Playwright) | `tests/e2e/*.spec.ts` | 2 specs |

### Golden eval

`npm run eval:golden` runs 5 curated retrieval cases against the seeded corpus (no LLM calls — uses the local WASM embedder). Each case measures Precision@K, Recall@K, MRR, and Groundedness. All 5 cases pass at the declared thresholds. Writes a JSON report to `data/eval-reports/`.

---

## Project Structure

```
ContentOps/
├── mcp/                              # Custom MCP server (stdio transport)
│   ├── contentops-server.ts          # Registers all 5 tools (read-only + mutating)
│   └── contentops-server.test.ts
├── scripts/
│   └── eval-golden.ts                # Golden eval CLI entry point
├── tests/
│   └── e2e/                          # Playwright smoke tests
│       ├── chat-tool-use.spec.ts
│       └── cockpit-dashboard.spec.ts
├── playwright.config.ts              # E2E config — webServer.env engages Anthropic mock
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── chat/route.ts                 # Anthropic tool-use loop + streaming
│   │   │   └── audit/
│   │   │       ├── route.ts                  # GET — RBAC-filtered audit log
│   │   │       └── [id]/rollback/route.ts    # POST — atomic compensating action
│   │   └── page.tsx                  # Chat homepage
│   ├── components/chat/
│   │   ├── ChatUI.tsx                # Stream reader + message state
│   │   ├── ChatMessage.tsx           # Individual message renderer
│   │   └── ToolCard.tsx              # Inline tool card + Undo button
│   ├── corpus/                       # Side Quest Syndicate markdown documents
│   ├── lib/
│   │   ├── anthropic/
│   │   │   ├── client.ts             # SDK construction (E2E-mock-flag-gated)
│   │   │   └── e2e-mock.ts           # Deterministic mock for Playwright runs
│   │   ├── auth/                     # Session cookies, RBAC types, constants
│   │   ├── chat/                     # Stream line parser, history helpers, system prompt
│   │   ├── db/                       # Schema, db singleton
│   │   ├── evals/                    # Golden eval: domain, scoring, runner, reporter
│   │   ├── rag/                      # Ingest, chunk, embed, retrieve (vector+BM25+RRF)
│   │   ├── test/                     # Shared test helpers (db, seed, embed-mock)
│   │   └── tools/
│   │       ├── domain.ts             # ToolDescriptor, MutationOutcome, AuditLogEntry
│   │       ├── registry.ts           # ToolRegistry — RBAC + audit + transactional mutate
│   │       ├── corpus-tools.ts       # search_corpus, get_document_summary, list_documents
│   │       ├── mutating-tools.ts     # schedule_content_item, approve_draft
│   │       ├── audit-log.ts          # write/read/markRolledBack helpers
│   │       └── create-registry.ts    # Factory wiring db → registry with all 5 tools
│   └── middleware.ts                 # RBAC route enforcement
└── docs/
    ├── _meta/agent-charter.md        # Engineering constraints and delivery rules
    └── _specs/                       # Spec, QA, and sprint docs for each sprint
```

---

## Sprint History

ContentOps is built sprint-by-sprint with a spec → QA → sprint plan → implementation → QA loop. All artifacts live in `docs/_specs/`.

| Sprint | Scope | Status |
|--------|-------|--------|
| 0 | Foundation (Next.js, SQLite, Zod, Vitest) | Complete |
| 1 | Homepage Chat UI + streaming shell | Complete |
| 2 | Sessions, message history, role overlay | Complete |
| 3 | Anthropic streaming + cost guardrails | Complete |
| 4 | Corpus ingestion + chunking + embeddings | Complete |
| 5 | Hybrid RAG retrieval + grounded chat | Complete |
| 6 | AI eval harness (golden retrieval eval) | Complete |
| 7 | Tool registry + read-only MCP tools | Complete |
| 8 | Mutating tools + audit log + rollback + test consolidation + first Playwright E2E | Complete |
| 9 | Operator cockpit dashboard + typing indicator | Complete |
| 10 | UI polish pass | Planned |
| 11 | Vercel deployment + README + Loom | Planned |

---

## License

ISC
