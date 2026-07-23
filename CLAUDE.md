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
- **Three distinct reset/delete actions exist — do not merge or remove any of them (Sprint D.19):**
  - **Replace** (`ParserResultsShell` header) swaps the active document: styled in-app `ConfirmDialog` (`role="alertdialog"`, `src/components/lease/ConfirmDialog.tsx`) — **not** `window.confirm` (Sprint 28.15) — and on accept revokes the active Blob URL + evicts that lease's IndexedDB-cached PDF bytes. **Client-side only**: server rows survive until the workspace TTL.
  - **Delete my review** (beside Replace, non-sample workspaces only) is the true server-side deletion: `POST /api/workspaces/delete-current` purges the caller's whole workspace cascade, clears the workspace cookie, and the client evicts the entire PDF cache (`evictExcept([])`). See `docs/_architecture/data-retention.md`.
  - **Clear assistant chat** stays chat-only (see above) — never touches lease, clauses, or red flags.
- Accessibility is baseline: WCAG-AA contrast, visible focus rings, `prefers-reduced-motion` respected at every animation site, ≥44px touch targets.
- Severity is communicated by text + icon/shape **and** color (`SeverityBadge`), never by color alone.
- **Mode B depth (Sprint 50).** The scan verdict (`red-flag-verdict`) reads as an *outcome*, not a tally: a soft tier-tinted halo (`VerdictHalo`) + a tier glyph (`VerdictTierGlyph`, reusing the exported `SEVERITY_ICON`) sit with the headline, and `data-tier` reflects `computeScanVerdict().tier`. Tier is carried by words + glyph + a colour wash, never colour alone; the halo is decorative (`aria-hidden`). Red-flag cards are **elevated paper**: `bg-surface-elevated` + the warm `--shadow-card` / `hover:shadow-card-hover` tokens, lifting out of their now-borderless `bg-surface-card` tray. A top-anchored `ResultsMastheadGlow` (reusing the `--accent-ambient-*` tokens) carries the landing's warmth across the seam as page atmosphere. **Do not add a per-card severity fill tint** — severity stays on the left bar + `SeverityBadge`; a coloured card fill is an explicit non-goal (it re-creates the "covered in colour" effect Sprint 48.1 dialled down).
- **Mode B premium pass (Sprint 51).** Red-flag cards are grouped by severity with counted `GroupDivider`s (`gradings` is pre-sorted high→medium→low→ok; dividers are keyed siblings inside the same `AnimatePresence`, so keep **one `red-flag-card` per non-OK grading**). HIGH cards earn presence via the **deeper resting `shadow-card-hover` + a heavier neutral border only** (never a fill). OK clauses roll up behind the collapsed `OkRollup` ("N clauses look standard"). The verdict's "biggest concern" is a `red-flag-verdict-concern` button using the shared `runHighlightJump` (the per-card `jumpToClausePage` delegates to it). The two explanation pills are merged into one segmented **Explain** control (`red-flag-explain-group`) that **keeps both `red-flag-explain-plain` + `red-flag-explain` testids + prompts** (fab e2e clicks `red-flag-explain`); "Draft email" is the accent primary. The **FAB is flat `bg-accent-700` + `shadow-popover`** (no gradient; `accent-700` for white-label AA — `accent-600` fails). `HighlightControls` carries a "Highlight on PDF" scope label. The grouped-reveal stagger was deferred (fragile against the live grading stream).
- **Assistant drawer readability (Sprint 52).** The FAB drawer's brand `<header>` and `assistant-context-bar` are **one folded masthead** (the bar lives inside the `<header>` with no `py-2.5` of its own). Chat-thread controls ("Clear assistant chat" / "Continue previous") moved out of the persistent toolbar strip into a **disclosure popover** behind a ⋯ trigger (`assistant-thread-menu-trigger` / `assistant-thread-menu`). The trigger + menu are **portaled into the masthead control cluster beside Expand/Close** via the `threadMenuContainer` prop (`createPortal`), so they never float over (and overlap) the transcript (Sprint 52.5 — the earlier floating placement collided with full-width message text in the non-expanded drawer). The `conversation-toolbar` element stays as the grid's row-1 anchor (`showToolbar ? '' : 'hidden'` gate kept) and hosts the menu **in place only for non-FAB / legacy mounts** (no `threadMenuContainer`). **The `new-conversation-btn` / `continue-previous-btn` testids, handlers, the `new-conversation-announcer` aria-live, and the `clear-assistant-chat-helper` (`aria-describedby`) are unchanged — only the chrome moved**; e2e opens the menu first via `tests/e2e/helpers/open-thread-menu.ts`. On `max-sm` the drawer is a **bottom sheet** (`MOBILE_SHEET_BASE` + `max-sm:translate-y-full` slide-up) opening at a **half** snap (`h-[58vh]`); the mobile-only `assistant-fab-snap-handle` (`sm:hidden`, 44px) toggles the local `expanded` flag to the **full** snap (`h-[92vh]`). The mobile height reads `expanded` directly, but `displayMode` stays `canExpand`-gated so a stale `expanded` never strands the desktop compact panel; the desktop Expand button is `max-sm:hidden` so the handle is the sole mobile expand affordance. Transcript measure capped to `max-w-2xl` (~74ch); default `workspace-drawer` height is `h-[min(760px,82vh)]`.

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
- **Do not make the imperative `scrollToPage` scroll directly (Sprint 50.6).** The card/citation/clause-row click sets `activeClauseId` AND calls `pdfViewerRef.scrollToPage(N)`. If `scrollToPage` scrolls immediately, it fights the `activeClauseId` effect's highlight-scroll → the double-scroll jank. `PdfViewer.client` keeps the single animated scroll in the `activeClauseId` effect (highlight-centre, else recorded-page fallback); `scrollToPage` only *records* the page (`pendingClauseScrollPageRef`). Page navigation uses the separate `scrollToPageNumber` path. Keep the `scrollToPage(N)` call on the card side — it is a pinned contract (RedFlagReport + integration tests).
- **Do not pass `inert=""` (empty string).** React 19 strips it silently. Pass `inert={true}` (cast through `any` is acceptable until the JSX typings catch up).
- **`LeaseLensWorkspaceShell.tsx` was removed** in the Sprint 26 parser-first pivot — there is no such file, test, or import. The live shells are `WorkspaceRouterShell` → `ParserLandingShell` (Mode A) / `ParserResultsShell` (Mode B), with chat in the `AssistantFab` drawer. Some `src/` comments still mention the old shell as historical "why" context (e.g. why `RoleSwitcher` uses `router.refresh`); those are load-bearing notes, not a live dependency — don't resurrect the shell.
- **Do not embed lease PDFs into the RAG index.** They belong in `leases`/`clauses` only; the corpus is NJ tenant law.
- **Do not commit `.env.local`, `.mcp.json`, `.playwright-mcp/`, `.claude/settings.local.json`** — all gitignored. Use `.env.example` for env documentation.
- **Severity color must never be the only signal.** Always pair with text + icon (`SeverityBadge` already does this).
- Mock/demo data lives in `src/lib/test/` and seeded fixtures only; do not let it leak into production code paths.
- **Deployment-mode / auth boundary (backend hardening — full detail in `docs/_architecture/architecture.md` invariant #9).** Cost/rate guardrails gate on `guardrailsEnforced()` (public-anon **OR** demo), **never `LEASELENS_DEMO_MODE` alone** — that inversion left a real production deploy unguarded. The **Edge** runtime (middleware) cannot import `env.ts` / `auth/mode.ts`; read mode via `auth/mode-edge.ts` (raw `process.env`). In public-anon mode a visitor is a **real, isolated `users` row (role Tenant) + own expiring workspace** (`auth/anon-identity.ts`), never the shared seeded Tenant or an immortal sample; lease routes fail closed via `requireSessionOrAnon` (`auth/resolve-session.ts`). **Do not re-introduce a demo-Tenant / sample-workspace fallback on any public-mode path.**
- **Vitest shares `process.env` across files.** Any test toggling `LEASELENS_PUBLIC_ANON_MODE` / `_TEST_*` MUST snapshot + restore in `afterEach`, or it leaks into `middleware.test.ts` + the spend/lease suites and reds them. Node routes toggle it via `vi.mock('@/lib/env', importOriginal)` with a `get LEASELENS_PUBLIC_ANON_MODE()` reading `process.env._TEST_PUBLIC_ANON_MODE` (see `auth/mode.test.ts`, `api/chat/route.integration.test.ts`).

## Verification Before Finishing

Run all four locally; report results in your QA note:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

If any cannot run in the current environment, say so explicitly and list what should run before merge. For UI-visible changes, also verify the affected flow in `npm run dev` against the seeded sample lease.
