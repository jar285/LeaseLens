# Implementation + QA — Sprint 56 Docs truth-up

**Status:** Shipped. **Branch:** `frontend/technical-debt`. Docs + comments only (no behavior change).

## What changed
- **Recreated `docs/_architecture/architecture.md`** — the technical architecture map that was lost when
  `docs/_meta/` was deleted in `94e80c5`. Covers stack, route/API + component/lib layout, the tool registry +
  DB tables, the Mode A→B shell flow, and a **Current Invariants** section (parser-first/assistant-second,
  provider order, per-context state ownership, RAG boundary, `MAX_TOOL_ITERATIONS = 15`, Replace via
  `ConfirmDialog` not `window.confirm`, severity-never-colour-alone, grounding). Every claim audited against
  current code first (Fowler), so the deleted doc's stale errors (`window.confirm`, tool-loop max `3`) are not
  carried forward. Includes the Sprint 53 self-hosted-font note + the `middleware.ts` → `proxy.ts` future note.
- **Fixed `CLAUDE.md`** — the "Known Gotchas" bullet that claimed `LeaseLensWorkspaceShell.tsx` "is dead
  production code … only its colocated test imports it" was actively false (the file was removed in the Sprint
  26 pivot — no file, test, or import). Rewritten to record the removal + name the live shells, and to flag the
  remaining historical `src/` comments as "why" context, not a live dependency.
- **Corrected the two present-tense `src/` comments** that implied the removed shell still exists/is used:
  `ResizableSplitLayout.tsx` ("Used by LeaseLensWorkspaceShell" → generic, notes it was originally for the
  since-removed shell; the layout is still live, imported by `PdfViewer.client.tsx`) and `ParserLandingShell.tsx`
  ("does NOT mount LeaseLensWorkspaceShell" → "does NOT render the post-upload workspace itself").
- **Preserved** the load-bearing historical root-cause comments (e.g. `RoleSwitcher` / `auth/actions.ts`
  explaining the `router.refresh` choice, `WorkspaceRouterShell` design notes) — CLAUDE.md rule: don't delete
  root-cause context. Superseded `docs/ui-ux-audit.md` / `docs/ui-ux-modernization-plan.md` and point-in-time
  `docs/_specs/` records left as historical.

## Verification
`grep` confirms no present-tense "is dead / Used by / does NOT mount" `LeaseLensWorkspaceShell` claims remain in
`src/` or `CLAUDE.md`. `npm run lint` clean · `npm run typecheck` clean · `npm test` **1385 passed** ·
`npm run build` green (docs/comments only — suite unaffected).

## Power-words applied
Ward Cunningham (recreate the lost durable artifact; kill the live `CLAUDE.md:97` misinformation) · Martin
Fowler (audit every claim vs code before writing) · Grady Booch / Eric Evans (explicit Current Invariants in
domain language) · Dieter Rams (remove misinformation noise without churning historical context).
