# ContentOps

An AI operator cockpit for onboarding a media brand into an AI-assisted content operations workflow. Built to demonstrate how LLMs, RAG, MCP tools, and structured engineering practices (RBAC, eval harnesses, audit-ready architecture) compose into a production-grade system — not just a chatbot.

**Demo brand:** Side Quest Syndicate — a fictional tabletop and board game media brand used as the seeded corpus throughout the project.

---

## What This Project Demonstrates

This project is a portfolio piece targeting Forward Deployed, AI Product, and Applied AI engineering roles. It demonstrates, in order of priority:

1. **Full-stack TypeScript delivery** — Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4, SQLite, end-to-end from schema to streaming UI.
2. **LLM + RAG + Tool composition** — Anthropic streaming chat, hybrid retrieval (vector + BM25 + reciprocal rank fusion), and an RBAC-aware tool registry wired into the Anthropic tool-use loop — not isolated API calls.
3. **AI evaluation** — A deterministic golden eval harness measuring retrieval quality (Precision@K, Recall@K, MRR, Groundedness) against a curated golden set. Runs in CI, exits 0/1.
4. **Engineering constraints** — Role-based access control (Creator / Editor / Admin) enforced in middleware, at the API layer, and in the tool registry. The same registry that filters the prompt's tool manifest also enforces execution — prompt claims and runtime behavior cannot drift apart.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Next.js 16 App Router                          │
│  ┌──────────────┐   ┌───────────────────────┐   │
│  │  Chat UI     │   │  /api/chat (POST)      │   │
│  │  (streaming) │◄──│  Anthropic tool-use   │   │
│  │  ToolCard    │   │  loop (max 3 iters)   │   │
│  └──────────────┘   └──────────┬────────────┘   │
└─────────────────────────────────┼───────────────┘
                                  │
              ┌───────────────────▼──────────────────┐
              │  ToolRegistry (RBAC-filtered)         │
              │  search_corpus · get_document_summary │
              │  list_documents                       │
              └───────────────────┬──────────────────┘
                                  │
          ┌───────────────────────▼──────────────────────┐
          │  SQLite (better-sqlite3)                      │
          │  users · sessions · conversations · messages  │
          │  documents · chunks · audit_log               │
          └───────────────────────┬──────────────────────┘
                                  │
              ┌───────────────────▼──────────────────┐
              │  RAG Pipeline                         │
              │  Ingest → Chunk → Embed (WASM)        │
              │  Retrieve: vector + BM25 + RRF        │
              └──────────────────────────────────────┘
```

**Custom MCP server** at `mcp/contentops-server.ts` exposes the same 3 tools over stdio transport — consumable by Claude Desktop, Cursor, or any MCP client.

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
| Testing | Vitest 4 |
| Linting | Biome |
| Validation | Zod 3 |

---

## Prerequisites

- Node.js 20+
- An [Anthropic API key](https://console.anthropic.com/)
- Git

---

## Running Locally

### 1. Clone and install

```bash
git clone git@github.com:jar285/ContentOps.git
cd ContentOps
npm install
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

## Features

### Role-Based Access (Creator / Editor / Admin)

Use the role switcher in the top-right corner of the chat UI. Each role unlocks different capabilities:

| Role | Tools available | Access |
|------|----------------|--------|
| Creator | `search_corpus` | Ask the AI to search the brand corpus explicitly |
| Editor | + `get_document_summary` | Inspect individual corpus documents by slug |
| Admin | + `list_documents` | View the full corpus inventory |

### Chat + RAG

The chat interface at `/` provides grounded answers about the Side Quest Syndicate brand. The assistant combines:
- **Implicit RAG** — automatic hybrid retrieval (vector + BM25 + RRF) injected as context on every turn.
- **Explicit tool calls** — the assistant can invoke `search_corpus` mid-conversation when the user's query warrants a fresh search.

### MCP Server

The same 3 tools are exposed over the Model Context Protocol for use in Claude Desktop, Cursor, or any MCP-compatible client:

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
# All unit and integration tests (106 tests)
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint

# Golden retrieval eval (deterministic, no LLM calls, exits 0/1)
npm run eval:golden
```

### What the tests cover

| Area | Files | Count |
|------|-------|-------|
| Tool Registry (RBAC, dispatch, errors) | `src/lib/tools/registry.test.ts` | 6 |
| Corpus tools (search, summary, list) | `src/lib/tools/corpus-tools.test.ts` | 4 |
| RAG retrieval pipeline | `src/lib/rag/*.test.ts` | ~20 |
| Chat route (streaming, tool-use loop) | `src/app/api/chat/route.integration.test.ts` | ~10 |
| Auth, sessions, middleware | `src/lib/auth/*.test.ts`, `src/middleware.test.ts` | ~20 |
| DB schema and helpers | `src/lib/db/*.test.ts` | ~10 |
| Eval scoring functions | `src/lib/evals/scoring.test.ts` | 6 |
| Eval runner | `src/lib/evals/runner.test.ts` | 3 |
| MCP contract | `mcp/contentops-server.test.ts` | 2 |
| UI components | `src/app/page.test.tsx` | ~25 |

### Golden eval

`npm run eval:golden` runs 5 curated retrieval cases against the seeded corpus (no LLM calls — uses the local WASM embedder). Each case measures Precision@K, Recall@K, MRR, and Groundedness. All 5 cases pass at the declared thresholds. Writes a JSON report to `data/eval-reports/`.

---

## Project Structure

```
ContentOps/
├── mcp/                          # Custom MCP server (stdio transport)
│   ├── contentops-server.ts
│   └── contentops-server.test.ts
├── scripts/
│   └── eval-golden.ts            # Golden eval CLI entry point
├── src/
│   ├── app/
│   │   ├── api/chat/route.ts     # Anthropic tool-use loop + streaming
│   │   └── page.tsx              # Chat homepage
│   ├── components/chat/
│   │   ├── ChatUI.tsx            # Stream reader + message state
│   │   ├── ChatMessage.tsx       # Individual message renderer
│   │   └── ToolCard.tsx          # Inline tool invocation card
│   ├── corpus/                   # Side Quest Syndicate markdown documents
│   ├── lib/
│   │   ├── auth/                 # Session cookies, RBAC types, middleware
│   │   ├── chat/                 # Stream line parser, history helpers
│   │   ├── db/                   # Schema, migrations, test helpers
│   │   ├── evals/                # Golden eval: domain, scoring, runner, reporter
│   │   ├── rag/                  # Ingest, chunk, embed, retrieve (vector+BM25+RRF)
│   │   └── tools/                # ToolRegistry, corpus tools, domain types
│   └── middleware.ts             # RBAC route enforcement
└── docs/
    ├── _meta/agent-charter.md    # Engineering constraints and delivery rules
    └── _specs/                   # Spec, QA, and sprint docs for each sprint
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
| 8 | Mutating tools + audit log + rollback | Planned |
| 9 | Operator cockpit dashboard | Planned |
| 10 | Vercel deployment + README + Loom | Planned |

---

## License

ISC
