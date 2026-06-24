# Sprint 56 — Docs truth-up (recreate architecture doc + dead-shell cleanup)

> Branch: `frontend/technical-debt` · commits `docs(s56.x): …`
> Plan: `~/.claude/plans/sounds-good-use-plan-sharded-lynx.md` (P1).
> Power-words: **Ward Cunningham** (durable knowledge / kill stale artifacts), **Martin Fowler**
> (audit-before-write — verify every claim vs current code), **Grady Booch / Eric Evans** (explicit domain
> invariants), **Dieter Rams** (remove misinformation noise).

## Problem / root cause

Two documentation-debt items mislead future agents (Ward Cunningham: knowledge that isn't in an accurate,
durable artifact becomes cost):

1. **The technical architecture doc was deleted.** `docs/_meta/architecture.md` (and the whole `docs/_meta/`
   dir) was removed in commit `94e80c5`. `docs/_architecture/` now holds only design-*philosophy* docs
   (development-philosophy, ui-ux-design-philosophy, power-words) — there is **no** current technical
   architecture / invariants map. The deleted doc was also stale (claimed Replace used `window.confirm` and the
   chat tool loop max was `3`).
2. **`CLAUDE.md:97` is actively wrong.** It states `LeaseLensWorkspaceShell.tsx` "is dead production code —
   only its colocated test imports it." The file **no longer exists** (removed in the Sprint 26 pivot; verified:
   no file, no test, no imports). An agent reading this will look for / try to preserve a file that's gone.

## Verified facts (audited against current code — Fowler)

- Chat tool loop: `MAX_TOOL_ITERATIONS = 15` (`src/app/api/chat/route.ts:66`) — NOT 3.
- Replace flow: `ConfirmDialog` (`role="alertdialog"`, `src/components/lease/ConfirmDialog.tsx`) — NOT
  `window.confirm`.
- `LeaseLensWorkspaceShell.tsx`: does not exist; live shells are `WorkspaceRouterShell` → `ParserLandingShell`
  (Mode A) / `ParserResultsShell` (Mode B).
- Edge middleware: `src/middleware.ts` exists and is current; Next 16 emits a "middleware convention is
  deprecated, use proxy" warning — proxy migration is a tracked future step, not done here.
- Fonts: self-hosted via `next/font/local` in `src/app/fonts.ts` (Sprint 53).
- RAG boundary: NJ tenant-law corpus only in `documents`/`chunks`; lease PDFs in `leases`/`clauses`, never
  embedded.

## Approach (docs + comments only — zero behavior change)

1. **Recreate `docs/_architecture/architecture.md`**: a concise, current technical map — stack, route/API
   layout, component domains, lib areas, the MCP server — plus a **Current Invariants** section:
   parser-first / assistant-second; provider order `AssistantFabProvider → LeaseParserProvider →
   ChatStreamProvider`; the per-context state-ownership boundary; the RAG boundary; the verified facts above
   (15-iteration tool loop, ConfirmDialog Replace, self-hosted fonts, middleware→proxy future note).
2. **Fix `CLAUDE.md`**: rewrite the `LeaseLensWorkspaceShell` "Known Gotchas" bullet (line ~97) to record that
   the shell was REMOVED in the Sprint 26 pivot and the live shells are the router + landing/results — so the
   lingering historical "why" comments in `src/` aren't mistaken for a live dependency.
3. **Correct the few present-tense `src/` comments** that imply the shell still exists/is used
   (`ResizableSplitLayout.tsx` "Used by …", `ParserLandingShell.tsx` "does NOT mount …"). **Preserve** the
   historical root-cause "why" comments (they're load-bearing context per CLAUDE.md — e.g. `RoleSwitcher` /
   `auth/actions.ts` explaining the `router.refresh` choice); just ensure none reads as a live dependency.
   Superseded `docs/` audits/plans + point-in-time `docs/_specs/` records are left as historical.

## Invariants
- No code behavior change → full suite stays green.
- Do not delete load-bearing historical root-cause comments (CLAUDE.md rule); only correct present-tense
  claims that the removed shell still exists.

## Verification
`npm run lint && npm run typecheck && npm test && npm run build` green (docs/comments only); grep confirms no
present-tense `LeaseLensWorkspaceShell` "is/uses" claims remain in `src/` + `CLAUDE.md`. `impl.md` QA note;
`history.md` + README rows.
