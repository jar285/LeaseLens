# LeaseLens — Architecture

> Technical map of the running system + the invariants that must hold. Recreated in Sprint 56 after the prior
> `docs/_meta/architecture.md` was deleted and had gone stale. Every claim here is verified against current
> code; when code and this doc disagree, **fix this doc** (Ward Cunningham: the durable artifact must stay true).

## Stack

Next.js 16 App Router (Turbopack) · React 19 + TypeScript strict · Tailwind CSS v4 (`@theme` tokens) ·
SQLite via `better-sqlite3` (WAL) · Anthropic Claude (`@anthropic-ai/sdk`) over NDJSON streaming ·
`pdfjs-dist` + `react-pdf` for the PDF viewer · `@huggingface/transformers` (WASM) for local RAG embeddings ·
Vitest + happy-dom (unit/component/integration) · Playwright (e2e) · Biome (lint + format). A custom MCP
server lives at `mcp/leaselens-server.ts`.

**Fonts (Sprint 53):** Geist, Geist Mono, and Source Serif 4 are **self-hosted** — vendored latin variable
`.woff2` in `src/app/fonts/`, loaded via `next/font/local` in `src/app/fonts.ts`, exposing the
`--font-geist-sans` / `--font-geist-mono` / `--font-source-serif` CSS variables consumed by the `@theme` block
in `globals.css`. No build-time Google CDN fetch → `next build` is deterministic offline.

## Layout

- **Routes / API:** `src/app/` (App Router). API handlers at `src/app/api/<route>/route.ts`
  (`/api/leases`, `/api/chat`, `/api/audit`, `/api/workspaces`, …). Edge middleware: `src/middleware.ts`
  (Next 16 warns this convention is deprecated in favour of `proxy.ts` — a tracked future migration, not yet
  done).
- **Components** (`src/components/`, grouped by domain): `auth/`, `brand/`, `chat/`, `cockpit/`, `layout/`,
  `lease/`, `states/`.
- **Domain logic** (`src/lib/`, by area): `anthropic/`, `audit/`, `auth/`, `chat/`, `cockpit/`, `content/`,
  `db/`, `evals/`, `http/`, `layout/`, `lease/`, `log/`, `motion/`, `rag/`, `tools/`, `workspaces/`, plus
  `env.ts` (Zod-validated env) + `version.ts`.
- **Tools** (role-filtered registry, `src/lib/tools/`): `search_corpus`, `extract_clauses`,
  `grade_clause_severity`, `get_lease_findings`, `draft_negotiation_email`, `render_workflow_diagram`.
  Mutating tools follow the audit + rollback pattern (async `prepare` → sync transaction; row insert + audit
  row insert wrap together).
- **Database tables:** `users`, `sessions`, `workspaces` (per-visitor, TTL via `expires_at`; the seeded
  sample workspaces are immortal, `is_sample=1`), `conversations`/`messages`, `documents`/`chunks` (NJ
  tenant-law corpus), `leases`/`clauses` (uploaded lease + parsed clauses), `negotiation_emails`,
  `tool_calls`, `audit_log`, `rate_limit`, `spend_log`.

## Workspace shells (Mode A → Mode B)

`WorkspaceRouterShell` chooses the surface on lease state:
- **Mode A — `ParserLandingShell`**: hero dropzone, no lease.
- **Mode B — `ParserResultsShell`**: two-column workspace (PDF viewer left, red flags + clauses right).

Chat is **assistant-second**: it lives in a floating `AssistantFab` drawer (bottom-right; a bottom sheet on
mobile), not in the main column. (The pre-Sprint-26 single-grid `LeaseLensWorkspaceShell` was removed in that
pivot; lingering `src/` comments that mention it are historical "why" notes only — it is not a live dependency.)

## Current Invariants

1. **Parser-first, assistant-second.** The PDF viewer + red flags + clauses are the load-bearing UI; chat is
   opt-in in the FAB drawer.
2. **Provider order (do not reorder):** `AssistantFabProvider → LeaseParserProvider → ChatStreamProvider`.
3. **State ownership is split by context:**
   - `LeaseParserContext` owns `activeLease`, `toolEvents`, `activeClauseId`, `pdfViewerRef`.
   - `ChatStreamContext` is **chat-only**: `viewerRole`, `autoScanConversationId`. No parser fields (pinned by
     a Vitest exposed-keys test).
   - `AssistantFabContext` owns drawer state, `pendingPrompt`, `selection`.
   Hooks read their own context (`useLeaseParser` / `useChatStream` / `useAssistantFab`); don't reach across.
4. **RAG boundary:** the NJ tenant-law corpus is the only thing in `documents`/`chunks`. Lease PDFs go in
   `leases`/`clauses` and are **never** embedded into the RAG index.
5. **Chat tool loop:** `MAX_TOOL_ITERATIONS = 15` (`src/app/api/chat/route.ts`) — raised from 3 in Sprint 13 to
   support per-clause grading on multi-clause leases.
6. **Three distinct reset/delete actions — never merged (Sprint D.19).** **Replace** (`ParserResultsShell`
   header) swaps the active document via the in-app `ConfirmDialog` (`role="alertdialog"`, never
   `window.confirm`) and clears that lease's browser-cached PDF state — client-side only, server rows survive
   until the workspace TTL. **Delete my review** (beside Replace, non-sample workspaces only) permanently
   purges the caller's server-side workspace cascade via `POST /api/workspaces/delete-current` and clears the
   browser cache (see [`data-retention.md`](data-retention.md)). **Clear assistant chat** resets only the chat
   thread, never the lease/clauses/red flags.
7. **Severity** is communicated by text + icon/shape **and** colour, never colour alone (`SeverityBadge`).
   WCAG-AA contrast; `prefers-reduced-motion` honoured at every animation site.
8. **Grounding:** `grade_clause_severity` validates the cited `chunk_id` + statute text and throws on failure;
   the assistant can't casually invent legal claims.
9. **Deployment modes + fail-closed auth boundary** (backend hardening, opt-in; branch `backend/enhancement`,
   not yet merged). Two independent env flags: `LEASELENS_DEMO_MODE` gates **UI affordances only** (role
   switcher, cockpit); `LEASELENS_PUBLIC_ANON_MODE` gates the public-anonymous profile. Cost/rate **guardrails
   enforce via `guardrailsEnforced()` = public-anon OR demo** (`src/lib/auth/mode.ts`) — *not* `DEMO_MODE`
   alone (that inversion left a real production deploy unguarded). `env.ts` **fails closed at boot** when public
   mode is on without `ANTHROPIC_API_KEY` + a positive spend ceiling. The **Edge** runtime (middleware) can't
   import `env.ts`, so it reads mode from `src/lib/auth/mode-edge.ts` (raw `process.env`); Node uses `mode.ts`.
   In public-anon mode each visitor is a **real, isolated, expiring `users` row (role Tenant) + its own
   non-sample workspace** (`src/lib/auth/anon-identity.ts`), never the shared seeded Tenant or an immortal
   sample; the lease routes resolve identity through the shared fail-closed `requireSessionOrAnon`
   (`src/lib/auth/resolve-session.ts`) — missing/invalid session or workspace → 401, never a demo fallback.
   Demo/default stays behavior-preserving. **Retention:** what is stored, for how long, who can see it, and
   how it dies — every statement traced to code + test — lives in [`data-retention.md`](data-retention.md)
   (Sprint D.24, #24): 24h workspace TTL + purge-on-resolve, on-demand delete-now, immortal samples,
   documented non-goals (export, further audit redaction).

## Testing

Colocated unit/component tests (`Component.test.tsx`) run on Vitest + happy-dom; e2e specs in `tests/e2e/` run
on Playwright (with reduced motion — Sprint 54 — to avoid Motion-timing flakiness; no e2e asserts the animated
path). Gate sweep: `npm run lint && npm run typecheck && npm test && npm run build`.
