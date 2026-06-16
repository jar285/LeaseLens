# CLAUDE.md

## Project Context

This is a Next.js 16 App Router application called **LeaseLens** — a tenant-facing residential-lease parser for NJ leases. Tech stack: React 19 + TypeScript strict, Tailwind CSS 4, SQLite via `better-sqlite3` (WAL), Anthropic Claude (`@anthropic-ai/sdk`) over NDJSON streaming, `pdfjs-dist` + `react-pdf` for PDFs, `@huggingface/transformers` (WASM) for local RAG embeddings, Vitest + happy-dom for unit/integration tests, Playwright for e2e, Biome for lint+format. A custom MCP server lives at `mcp/leaselens-server.ts`.

## Agent Operating Rules

- Read code before writing it. Never invent file paths, hook names, API shapes, or commands.
- Prefer the **smallest reviewable change** that makes the failing test pass. Don't combine unrelated work.
- **Sprint-style commits**: each commit has one purpose; the message references the sprint number (`feat(s28.x): …`, `fix(s28.x): …`). Match this style.
- **TDD-by-default for behavior changes**: red test → green implementation → refactor. Don't skip tests.
- Preserve existing behavior unless explicitly asked to change it. No broad opportunistic refactors.
- The audit/spec docs in `docs/_specs/sprint-*/` are input to your decisions — read them, but verify against current code; they can be stale.
- When you finish, write a one-paragraph QA note in the relevant sprint plan or in your PR description: what changed, tests added, verification results.

## Product / UX Direction

LeaseLens is **parser-first**, assistant-second:

- The PDF viewer + red flags + clauses list are the load-bearing UI. The chat is opt-in.
- The home page opens in **Mode A** (`ParserLandingShell` — hero dropzone). After upload it flips to **Mode B** (`ParserResultsShell` — two-column workspace) via `WorkspaceRouterShell`.
- Chat lives inside a **floating drawer** (`AssistantFab`), anchored bottom-right. The drawer **lazy-mounts on first open and stays mounted** so typed drafts and the conversation survive close → reopen.
- Card actions on red-flag cards and clause rows (Explain, Draft email) open the drawer pre-seeded via `fab.openWith({ initialPrompt, clauseId, severity, statuteCitation })`.
- "Clear assistant chat" (the button inside the drawer) resets only the chat thread. **It must not touch the lease, extracted clauses, or red flags.** An aria-live announcer says so explicitly for SR users: *"Assistant chat cleared. Your lease review was preserved."*
- The only destructive workspace-reset path is **Replace** in `ParserResultsShell`'s header. It opens a styled in-app `ConfirmDialog` (`role="alertdialog"`, `src/components/lease/ConfirmDialog.tsx`) — **not** `window.confirm` (Sprint 28.15) — and on accept revokes the active Blob URL + evicts the IndexedDB-cached PDF bytes.
- Accessibility is baseline: WCAG-AA contrast, visible focus rings, `prefers-reduced-motion` respected at every animation site, ≥44px touch targets.
- Severity is communicated by text + icon/shape **and** color (`SeverityBadge`), never by color alone.

## Architecture Constraints

- App routes + API routes: `src/app/` (App Router). API handlers under `src/app/api/<route>/route.ts`.
- UI components: `src/components/` grouped by domain — `auth/`, `brand/`, `chat/`, `cockpit/`, `layout/`, `lease/`, `states/`.
- Domain logic: `src/lib/` by area — `anthropic/`, `audit/`, `auth/`, `chat/`, `cockpit/`, `content/`, `db/`, `evals/`, `http/`, `layout/`, `lease/`, `log/`, `motion/`, `rag/`, `tools/`, `workspaces/`, plus `env.ts` + `version.ts`. PDF evidence highlighting lives in `src/components/lease/` (`PdfHighlightContext`, `PdfEvidenceOverlay`, `PdfEvidenceGutter`, `HighlightControls`, `use-clause-highlights`, `highlight-render`) + `src/lib/lease/highlight-match.ts`; structured logging + per-request correlation in `src/lib/log/` + `src/lib/http/`.
- Tests are **colocated**: `Component.test.tsx` next to `Component.tsx`. E2E specs live in `tests/e2e/`.
- Path alias `@/` → `src/` (`tsconfig.json` + `vitest.config.ts`).
- Provider tree in the workspace shells (do not reorder without understanding why): `AssistantFabProvider` → `LeaseParserProvider` → `ChatStreamProvider`.
- **State ownership is enforced by separate React contexts**:
  - `LeaseParserContext` owns `activeLease`, `toolEvents`, `activeClauseId`, `pdfViewerRef`.
  - `ChatStreamContext` is chat-only: `viewerRole`, `autoScanConversationId`. **Do not re-add parser fields here** — the exposed-keys boundary is pinned by a Vitest test.
  - `AssistantFabContext` owns drawer state (`closed`/`drawer`), `pendingPrompt`, `selection`.
- Mutating tools (e.g. `draft_negotiation_email`) follow the audit + rollback pattern in `src/lib/tools/` — async `prepare` step before the sync transaction; row insert + audit row insert wrap together.
- The NJ tenant-law corpus is the only thing in `documents` / `chunks`. Lease PDFs go into `leases` / `clauses` and are **never** embedded into the RAG index.

## Code Style Rules

- TypeScript strict. Functional React components. No class components.
- Biome enforces formatting + lint: single quotes, semicolons, 2-space indent.
- Comments are **WHY-focused**. The repo convention is to prefix non-trivial comments with the sprint number that introduced them (`// Sprint 28.x — <reason>`). Don't write WHAT-the-code-does comments.
- Sprint-tagged comments referencing root causes (e.g. Bug 2's two roots) are load-bearing context for future readers — preserve them when editing nearby code.
- Hooks read parser state via `useLeaseParser()`, chat state via `useChatStream()`, FAB state via `useAssistantFab()`. Don't reach across contexts.
- Severity / status / progress logic lives in pure helpers (`use-scan-progress.ts`, `scan-lifecycle.ts`, `grading.ts`) — components should consume, not duplicate.
- No new dependencies unless they clearly reduce complexity or enable required functionality. Check `package.json` first.
- New env vars must be declared in `src/lib/env.ts` (Zod schema) **and** mirrored in `.env.example`.

## Testing Rules

- Vitest + happy-dom for unit/component/integration; Playwright for e2e. `@testing-library/react` for component tests.
- TDD for behavior changes: write the failing test first, run it red, implement, run it green, refactor.
- Add regression tests for confirmed bugs — name them with the sprint that fixed the bug (e.g. *"Sprint 28.10 — outer shell has overflow-hidden …"*).
- Test the behavior, not the implementation. Prefer `getByRole`/`getByTestId` over CSS selectors. Disambiguate multiple `role="status"` regions by textContent.
- Provider-aware tests: use the shared `withChatStream` helper in `src/components/chat/test-helpers.tsx` which wraps in all three providers. Direct mounts of `ChatStreamProvider` must also wrap with `LeaseParserProvider` + `AssistantFabProvider` if the component-under-test uses those hooks.
- Replace uses an in-app `<dialog>` (`ConfirmDialog`), so tests must polyfill `HTMLDialogElement.prototype.showModal`/`close` (happy-dom omits them — mirror `PdfFocusDialog.test.tsx` / `ParserResultsShell.test.tsx`). Replace no longer calls `window.confirm`; a `ParserResultsShell` test stubs `confirm` only to **assert it is never invoked**.
- Never skip tests (`xit`, `describe.skip`, `test.only`). The suite must remain fully green.

## Commands

Verified against `package.json`:

```bash
npm run dev              # next dev (predev seeds DB + copies pdf worker)
npm run build            # next build
npm run start            # next start
npm run lint             # biome check src/
npm run typecheck        # tsc --noEmit
npm test                 # vitest run (unit + component + integration)
npm run test:e2e         # playwright test
npm run db:seed          # idempotent corpus seeder
npm run eval:golden      # tier-1 eval harness
npm run eval:leases      # tier-2 lease grading eval
npm run mcp:server       # stdio MCP server
```

Node `>=20.9.0`. Env vars validated by Zod in `src/lib/env.ts`; copy `.env.example` → `.env.local` for local dev.

## Known Gotchas / Do Not Do This

- **Do not reset parser state from a chat-thread action.** "Clear assistant chat" must only call `fab.clearPendingContext()` + clear `messages`. The lease/clauses/red-flags survive by construction.
- **Do not re-add parser fields to `ChatStreamContext`.** The exposed-keys invariant test in `ChatStreamContext.test.tsx` fails immediately if you do.
- **Do not put `pb-*` on a scroll container** for FAB clearance. Past bug: it inflated `scrollHeight` permanently and created an empty scroll area below the last card. Use a `shrink-0 h-28` sentinel as the last child instead.
- **Do not push tool events with `input: {}`.** `useScanProgress.countAttemptsSince` reads `input.clause_id` to count grading attempts; auto-scan / streaming code paths must thread the `tool_use.id → input` map into matching `tool_result` events. `readGradingClauseId` falls back to `result.clause_id` as defense, but the source path should not rely on the fallback.
- **Do not pass `inert=""` (empty string).** React 19 strips it silently. Pass `inert={true}` (cast through `any` is acceptable until the JSX typings catch up).
- **`LeaseLensWorkspaceShell.tsx` is dead production code** — only its colocated test imports it. Don't add new dependencies on it; it's slated for removal.
- **Do not embed lease PDFs into the RAG index.** They belong in `leases`/`clauses` only; the corpus is NJ tenant law.
- **Do not commit `.env.local`, `.mcp.json`, `.playwright-mcp/`, `.claude/settings.local.json`** — all gitignored. Use `.env.example` for env documentation.
- **Severity color must never be the only signal.** Always pair with text + icon (`SeverityBadge` already does this).
- Mock/demo data lives in `src/lib/test/` and seeded fixtures only; do not let it leak into production code paths.

## Verification Before Finishing

Run all four locally; report results in your QA note:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If any cannot run in the current environment, say so explicitly and list what should run before merge. For UI-visible changes, also verify the affected flow in `npm run dev` against the seeded sample lease.
