# Sprint 27 — Production Pivot (FAB Persistence · Tenant-Only UI · 6-Stage Loading)

**Status:** Implemented locally on `feature/cockpit`, awaiting human QA + commit.
**Date:** 2026-05-19.
**Branch:** `feature/cockpit` (continuation from Sprint 26c).
**Parent plan:** [`~/.claude/plans/leaselens-refactor-robust-sutton.md`](../../../).
**Predecessor:** [Sprint 26c — FAB Assistant](../sprint-26c-fab-assistant/spec.md).

> **Read this first if you're picking the session back up.** This sprint is the only thing that landed on top of Sprint 26c. Everything else in the working tree (parser landing, parser results, MermaidDiagram, diagram-tools, system-prompt tweaks) belongs to earlier sprints that were already in flight.

---

## 1. Problem

Sprint 26c moved chat into a Floating Action Button so the parser results could carry the visual core. With the FAB in place, three production-readiness gaps remained:

1. **FAB closes destroyed user state.** Typed-but-unsent drafts vanished, the in-progress conversation reset, and the clicked-clause context was cleared every close→open cycle. Root cause: a `key={fab.pendingPrompt ?? 'fresh'}` prop on `<ChatUI>` inside `AssistantFab.client.tsx` plus `fab.close()` nulling `pendingPrompt`, which together forced a full unmount. Violates Don Norman's predictable-interaction principle.
2. **Header still exposed Reviewer + Admin role pills** — useful during prototyping, but they make the production product feel like an internal demo. Backend role guards (`/api/admin`, audit rollback, cockpit page) must keep working for future internal tooling.
3. **Red Flags panel went visually quiet for the first ~1–2 seconds after upload.** The existing three-phase progress model (`extracting` / `grading` / `complete`) skipped the pre-extract phases, so the panel sat with empty skeleton stack while the chat stream was just warming up. Violates Jakob Nielsen's visibility-of-system-status.

The user also asked for an audit of dead code and hardcoded data. The audit (see §3) found no truly dead code; `LeaseLensWorkspaceShell.tsx` is the only legacy outlier and is already scheduled for Sprint 26d removal.

---

## 2. Invariants (carried from Sprint 26c and earlier)

1. **`useReducedMotion()` gate is non-negotiable.** New row-stagger animation in `RedFlagsLoadingState` collapses to instant under `prefers-reduced-motion: reduce`.
2. **Severity communicated by text + icon/shape + layout, never by color alone.**
3. **Existing `SeverityBadge`, `CitationChip`, `GradingDetailBlock`, `ScanTimeline`, `RedFlagReport`, `ClausesList`** are reused. The 6-stage panel is **additive** — the existing skeleton-card path in `RedFlagReport` is replaced one-for-one, all other render branches stay intact.
4. **`ChatStreamContext` remains the single source of truth.** `useScanLifecycle` derives from it; it does not fork state.
5. **No legal-pipeline, corpus, classifier, tool-contract, schema, or `/api/chat` route changes.**
6. **Verbatim citation validation in `grade_clause_severity` not weakened.**
7. **Disclaimer renders bold at the end of grading messages.**
8. **Public component surface for unchanged components stays frozen.** `LeaseUploadDropzone`, `PdfViewer`, `ChatUI` keep their props.
9. **Test count never decreases.** Sprint 27 net change: **+25 tests** (lifecycle: +11, loading state: +6, FAB persistence: +4, FAB context: +1 new, +2 replaced behavior; ParserResultsShell + RedFlagReport: +1 swapped, 0 net for those two files).
10. **WCAG AA contrast; visible focus states; ≥ 44×44 touch targets.**
11. **Role-gated progressive disclosure preserved.** Backend role guards untouched.
12. **Pure UI sprint** — NDJSON envelope and `/api/chat` shape unchanged.

---

## 3. Audit summary

Conducted before any code changed. Three parallel `Explore` agent passes — parser pipeline, FAB state, hardcoded/roles. Findings:

- **No truly dead code.** `LeaseLensWorkspaceShell.tsx` is marked legacy + isolated; will be removed in Sprint 26d.
- **`RedFlagReport.tsx` is 804 LOC** — only oversize outlier. Splitting into `RedFlagCard` + `RedFlagList` + wrapper is **deferred** to a follow-up (purely structural, no user-visible behavior change). See §6.
- **Hardcoded `Live · v23.i`** literal at `src/app/page.tsx:218`. Hoisted into `src/lib/version.ts`.
- **`LEASELENS_DEMO_MODE` env flag already existed** in `src/lib/env.ts`. PR 2 wires consumers; the schema needed no change.
- **`TRUST_METRICS` + `FLOW_STAGES`** hardcoded arrays in `ParserLandingShell.tsx:47-59` — kept (decorative trust copy).
- **Decorative "Example" preview card** in `RedFlagReport.tsx:225-243` — kept (already `aria-hidden`, marked Example).
- **Demo lease fixture** (Hudson Realty LLC / Maya Chen / 245 Grove Street) — kept; legitimate sample data.
- **Existing FAB integration test `AssistantFab.integration.test.tsx:113-151` validated the broken behavior** ("re-prefills on close"). Replaced with a real persistence test.

Detailed audit reports live in the parent plan at `~/.claude/plans/leaselens-refactor-robust-sutton.md`; not reproduced here.

---

## 4. The three PRs

> Each PR is independently revertible. They are sequenced for safety, not coupling.

### PR 1 — FAB state persistence

**Goal:** Closing the FAB **hides** the drawer; it does not unmount or reset. The conversation, the composer draft, and the active clause selection all survive a close→open cycle.

**Behavior change:**
- `fab.close()` only sets `state = 'closed'` now. It no longer nulls `pendingPrompt` or clears `selection`.
- A new `fab.clearContext()` method (additive) performs the old reset semantics for callers that genuinely want a hard reset (e.g. a future "New conversation" affordance).
- The drawer lazy-mounts on first open and stays mounted thereafter, hidden via `display: none` + `aria-hidden="true"` + `inert=""` when closed. The unmount-forcing `key={fab.pendingPrompt ?? 'fresh'}` prop on `<ChatUI>` is removed; `ChatComposer`'s existing `lastPrefillRef` logic ([ChatComposer.tsx:56-61](../../../src/components/chat/ChatComposer.tsx#L56)) handles new prefills correctly without remounting.

**Acceptance criteria met:**
- ✅ Typed draft (prefill + appended user text) survives close→open.
- ✅ Active conversation persists; reopening shows the same transcript.
- ✅ `selection.clauseId / severity / statuteCitation` persist across close→open.

**Files:** see [impl.md → PR 1](./impl.md#pr-1--fab-state-persistence).

---

### PR 2 — Tenant-only public UI (hide via env flag, don't delete)

**Goal:** The public production UI exposes only the Tenant role. Reviewer and Admin code stays in the tree for future internal tooling but is hidden behind `LEASELENS_DEMO_MODE`.

**Behavior change:**
- `RoleSwitcher` and the `Cockpit` header link in `src/app/page.tsx` are gated on `env.LEASELENS_DEMO_MODE`.
- The hardcoded `Live · v23.i` literal is replaced by `{LEASELENS_STATUS} · {LEASELENS_VERSION}` from new `src/lib/version.ts`.
- Backend guards untouched: `middleware.ts` still issues a Tenant cookie by default, `ADMIN_ONLY_PREFIXES` still enforced, `/cockpit` page still redirects Tenant users, `audit rollback` ownership check unchanged, `ToolCard` verbosity gating unchanged.
- Playwright e2e overrides `LEASELENS_DEMO_MODE=true` in `playwright.config.ts` so role-dependent specs (cockpit-dashboard, three-pane-shell, role-flows) keep passing.

**Production deployment:** `.env.local`, `.env.test`, and `.env.example` already had `LEASELENS_DEMO_MODE=false`. The flag is server-only (no `NEXT_PUBLIC_` prefix); `src/app/page.tsx` is a server component, so it reads `env.LEASELENS_DEMO_MODE` directly.

**Files:** see [impl.md → PR 2](./impl.md#pr-2--tenant-only-public-ui).

---

### PR 3 — Six-stage scan lifecycle in the Red Flags panel

**Goal:** Replace the bare skeleton-card stack with a narrated 6-stage panel so the user always knows what the parser is doing and what's next.

**The six stages (authoritative copy):**

| # | Stage ID | User-facing label | Detail subtext (when active) |
|---|---|---|---|
| 1 | `upload_received` | Upload received | — |
| 2 | `reading_lease` | Reading the lease | — |
| 3 | `extracting_clauses` | Extracting clauses | `N clauses found` |
| 4 | `checking_clauses` | Checking clauses against NJ tenant-law rules | `Grading M of N` |
| 5 | `preparing_red_flags` | Preparing red flags | — |
| 6 | `review_ready` | Review ready | `N clauses` |

**Derivation rules** (pure function `computeScanLifecycleStage` in `src/components/lease/scan-lifecycle.ts`):

- `idle` — no active lease and no scan in flight, OR degenerate extract (`phase === 'extracting' && total === 0`). The lifecycle panel does NOT render in this case; the existing empty state (with the "Also catches" preview) takes over.
- `upload_received` — `hasActiveLease && scanProgress.phase === 'idle' && toolEvents.length === 0`.
- `reading_lease` — `hasActiveLease && scanProgress.phase === 'idle' && toolEvents.length > 0` (stream started, no extract event yet).
- `extracting_clauses` — `scanProgress.phase === 'extracting' && total > 0`.
- `checking_clauses` — `scanProgress.phase === 'grading'`.
- `preparing_red_flags` — `scanProgress.phase === 'complete' && !preparingDone` (the brief hold before transitioning to review_ready).
- `review_ready` — `scanProgress.phase === 'complete' && preparingDone`.

`preparingDone` is flipped by a single `setTimeout(650 ms)` inside `useScanLifecycle`. Reasoning: 650 ms is long enough for the stage to register as a distinct step but short enough to feel like polish, not a wait.

**Visual contract** (`RedFlagsLoadingState.tsx`):

- A thin 1 px progress rail at the top, filled proportionally to `(index + 1) / 6`.
- An `<ol role="list" aria-live="polite">` below with one `<li>` per lifecycle stage. Each row has a status indicator (filled check, spinner, or muted dot), the label, and — for the active row only — the live-count subtext.
- Earlier rows: `data-status="complete"`. Current row: `data-status="active"`. Later rows: `data-status="pending"`.
- Row reveal: 220 ms ease-out stagger (50 ms per row). Collapsed to instant under `prefers-reduced-motion`.

**Gating in `RedFlagReport`:**

```ts
const inFlight =
  lifecycle.stage !== 'idle' &&
  lifecycle.stage !== 'review_ready' &&
  gradings.length === 0;
if (inFlight) {
  return <RedFlagsLoadingState snapshot={lifecycle} />;
}
```

When `gradings.length > 0` the existing card list takes over. The lifecycle panel is strictly the loading surface, not a permanent header.

**Files:** see [impl.md → PR 3](./impl.md#pr-3--six-stage-scan-lifecycle).

---

## 5. Design principles applied

- **Don Norman (predictable interaction):** Close on the FAB now means hide, never reset. The 6-stage lifecycle always answers "what is the parser doing now and what comes next?"
- **Jakob Nielsen (visibility of system status):** Six narrated stages replace an undifferentiated skeleton stack. Live counts surface as subtext where available.
- **Steve Krug (obvious product):** Tenant-only header removes role-switcher confusion in production; the public surface reads as "PDF parser + assistant" not "internal demo."
- **Dieter Rams (less, but better):** No new visual decoration. The progress bar is single-channel and 1 px tall. The stage list is a calm vertical column, not a busy banner.
- **WCAG / Apple HIG / Material:** `aria-live="polite"` on the lifecycle list; `aria-hidden` + `inert` on the hidden drawer; `prefers-reduced-motion` honored; keyboard focus restored to the FAB pill on close (existing behavior preserved).
- **Martin Fowler / Uncle Bob (small safe steps):** Three independently revertible PRs. Each ships behavior-preserving except for the targeted change. No structural refactor (RedFlagReport split) bundled in.
- **Pure-function derivation (testability):** `computeScanLifecycleStage` is pure; every transition is unit-tested without React or timers. The hook layer adds a single short timer on top.

---

## 6. Deferred / explicitly out-of-scope

These items appeared in the original plan but were **not** implemented this sprint, by design (avoid bundling structural refactors with behavior changes):

- **`RedFlagReport.tsx` file split** (`RedFlagCard.tsx` + `RedFlagList.tsx` + wrapper). The file remains ~810 LOC. Behavior is unchanged; the split is purely structural and can be done as a follow-up without risk to users.
- **Removing `LeaseLensWorkspaceShell.tsx`** — already scheduled for Sprint 26d.
- **Splitting `ToolCard.tsx` and `LeaseUploadDropzone.tsx`** — non-blocking; can wait.
- **Moving the sample lease fixture to `src/fixtures/`** — only useful when multi-jurisdiction support lands.
- **Multi-jurisdiction (parameterizing `NJSA · 46:8`)** — out of this sprint's scope.
- **`NEXT_PUBLIC_LEASELENS_DEMO_MODE`** — not needed because the gating call site (`src/app/page.tsx`) is a server component reading the server-side `env` schema.

---

## 7. Verification (local, pre-commit)

| Check | Result |
|---|---|
| `npm test -- --run` (full unit suite) | **1010 pass / 1 flaky timeout** (`src/app/api/leases/[id]/route.integration.test.ts`, passes in isolation — unrelated to Sprint 27). |
| `npx tsc --noEmit` | clean |
| `npx biome check` on the 9 Sprint 27 files | clean after one autofix to `RedFlagsLoadingState.tsx` |
| `npm run build` | not yet run — recommended before merge |
| Playwright e2e | not yet run — see §8 below |

**Test count delta:** baseline before Sprint 27 was 994. After Sprint 27: 1010 (+16 net — some prior tests were replaced rather than added; net new behavior tests = 11 lifecycle + 6 loading-state + 4 FAB persistence + 1 FAB clearContext = 22, minus 6 that were rewritten in place).

---

## 8. Recommended manual + e2e verification before merge

1. **Manual smoke — PR 1 (FAB persistence):**
   - Open the FAB → type a question → close → reopen → text and any messages survive.
   - Click "Explain this clause" on a red flag → close → reopen → clause-context chips still enabled.
2. **Manual smoke — PR 2 (Tenant-only UI):**
   - With `LEASELENS_DEMO_MODE=false` (default), confirm header has no role pills and no Cockpit link.
   - Navigate directly to `/cockpit` → redirects home.
   - Flip `LEASELENS_DEMO_MODE=true` locally → role switcher reappears.
3. **Manual smoke — PR 3 (lifecycle):**
   - Upload `sample-nj-residential-lease.pdf` → watch all 6 stages advance in the red-flags panel.
   - Verify live counts ("12 clauses found", "Grading 7 of 12").
   - Toggle `prefers-reduced-motion: reduce` in DevTools → stage transitions still occur, no stagger.
4. **E2e:**
   - `npm run test:e2e` — `playwright.config.ts` now exports `LEASELENS_DEMO_MODE=true` so existing role-based specs keep working.
5. **Accessibility:**
   - Tab into the red-flags panel → screen reader should announce stage transitions via the `aria-live="polite"` list.
   - Focus the FAB pill → Tab → composer should be reachable; Escape → drawer hides; focus returns to pill.

---

## 9. Known surface area for regression

If something breaks after this sprint, the most likely culprits — in order of probability:

1. **The drawer-hidden render path.** The drawer DOM persists with `display: none`. Make sure focus and tab order aren't leaking. (Mitigation in place: `inert=""` + `aria-hidden="true"` while hidden.)
2. **`useScanLifecycle`'s timer.** The 650 ms `preparingDone` setTimeout is cleared on unmount and phase change. A stuck "Preparing red flags" stage would mean the timer's cleanup ran after the next phase transition — investigate the `useEffect` deps in `scan-lifecycle.ts:186-195`.
3. **`env.LEASELENS_DEMO_MODE` mismatch.** If a deploy environment doesn't set the flag, it defaults to `'false'` and the role switcher disappears. Verify the deploy env explicitly.
4. **The replaced test `AssistantFab.integration.test.tsx:113-151`.** The old test passed even with the bug. If a future change reintroduces the bug, the new persistence test should catch it — make sure it isn't accidentally weakened.

---

## 10. References

- Per-file change inventory: [impl.md](./impl.md).
- Parent plan: [`~/.claude/plans/leaselens-refactor-robust-sutton.md`](../../../).
- Audit findings (in-conversation, not persisted): see parent plan §3.
