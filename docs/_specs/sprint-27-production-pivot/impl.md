# Sprint 27 — Implementation Inventory

**Purpose:** This file is the anti-drift anchor. It enumerates every file that changed in Sprint 27, what changed in each, and why. Read it before extending any of these surfaces in a later sprint or session — it prevents reading the wrong line numbers, restoring removed behavior, or guessing at the new contracts.

**Scope.** Only files this sprint touched. Other modified-in-tree files (MermaidDiagram, diagram-tools, system-prompt, ChatStreamContext additions, LeaseLensWorkspaceShell tweaks, follow-up-prompts, etc.) belong to earlier sprints already in flight on `feature/cockpit`. Do not attribute them to Sprint 27.

---

## PR 1 — FAB state persistence

### `src/components/chat/AssistantFabContext.tsx` (modified)

**What changed:**
- `close()` now only sets `state = 'closed'`. It no longer nulls `pendingPrompt` or clears `selection`.
- A new `clearContext(): void` method was added. It performs the old reset semantics: `state = 'closed'`, `pendingPrompt = null`, `selection = EMPTY_SELECTION`.
- `AssistantFabContextValue` interface gained a `clearContext: () => void` field; consumers are free to ignore it.
- Doc-comment on `close` rewritten to reflect the new "hide, don't reset" semantics. Doc-comment on `clearContext` explains when to use it (e.g. a future "New conversation" button).
- `useMemo` dependency array includes `clearContext` alongside the existing callbacks.

**Why:** Closing the FAB should be a hide, not a tear-down. Persisting `pendingPrompt` and `selection` lets `ChatComposer.tsx` and the chip-context logic survive close→open without state plumbing.

**Reverse engineering note:** The old close-clears-everything behavior is now opt-in via `clearContext()`. Search for `clearContext` callers if you suspect a stale-state bug.

### `src/components/chat/AssistantFab.client.tsx` (modified)

**What changed:**
- Imports: `useState` added to the React import.
- A new `useState<boolean>(false)` named `hasMountedDrawer` plus a one-shot `useEffect` flip it to `true` on the first transition to `state === 'drawer'`. The drawer subtree never renders before the first open (preserves the lazy-bundle goal from 26c) but never unmounts thereafter.
- The drawer's outer `<div>` now renders whenever `hasMountedDrawer` is true. Visibility is controlled with three attributes set when `state !== 'drawer'`:
  - `aria-hidden="true"`
  - `inert=""` (typed via `{...({ inert: '' } as any)}` because the ambient JSX types in this project lag behind React 19's stable `inert` attribute)
  - Tailwind `hidden pointer-events-none` (sets `display: none` and rules out stray pointer events)
- `data-state` attribute exposed on the drawer (`drawer` / `closed` / `menu`) so tests can assert state without re-querying the FAB context.
- The `key={fab.pendingPrompt ?? 'fresh'}` prop on `<ChatUI>` was **removed**. This was the single biggest cause of state loss: changing `pendingPrompt` to `null` on close flipped the React key and forced a full ChatUI unmount → ChatComposer state lost → conversation lost.
- Comment block above the new `hasMountedDrawer` state explains the rationale (Don Norman + Jakob Nielsen).

**Why:** The drawer DOM staying mounted is what makes the composer's local `text` state, the ChatUI message list, and the active-conversation ID all survive a close→open cycle. The `key` prop removal is the surgical fix — `ChatComposer.tsx:56-61` already has a `lastPrefillRef` re-sync path that handles fresh `openWith({ initialPrompt: ... })` calls correctly.

**Public surface:** No prop changes. The component continues to accept `{ workspaceName, conversationId, initialMessages, onToolEvent? }`.

### `src/components/chat/ChatComposer.tsx` — **unchanged**

The existing `lastPrefillRef` re-sync at lines 56-61 is already correct for the new flow. Confirmed by the `AssistantFab.integration.test.tsx → openWith seeds the composer + submitting posts the prompt to /api/chat` test still passing.

### `src/components/chat/AssistantFabContext.test.tsx` (modified)

**What changed:**
- The test `close returns to closed and clears pendingPrompt + selection` was **rewritten** to `close returns to closed but preserves pendingPrompt + selection so reopening restores context`. It now asserts that after `close()`, `pendingPrompt === 'Hello'`, `selection.clauseId === 'c1'`, `selection.severity === 'medium'`, `selection.statuteCitation === 'NJ Stat 46:8-19'`.
- A new test `clearContext fully resets state, pendingPrompt and selection` covers the additive `clearContext()` method.

**Net:** -1 test replaced + 1 new test added = **+1 test** in this file.

### `src/components/chat/AssistantFab.client.test.tsx` (modified)

**What changed:**
- `clicking the drawer close button returns the FAB to the closed state` → **rewritten** to `clicking the drawer close button hides the drawer but keeps it mounted so chat state survives`. New assertions: drawer is still in the DOM, has `aria-hidden="true"`, `data-state="closed"`; `fab.state === 'closed'`.
- `Escape on the drawer closes it` → updated to `Escape on the drawer hides it (state goes to closed, DOM persists)` with matching assertions.
- New test `drawer does not mount before first open (lazy mount)` covers the `hasMountedDrawer` gate.
- New test `reopening the drawer after close keeps the same ChatUI instance and prefill` covers the no-remount contract via the ChatUI mock's `data-prefill` attribute.

**Net:** 2 tests rewritten + 2 new tests added = **+2 tests** in this file.

### `src/components/chat/AssistantFab.integration.test.tsx` (modified)

**What changed:**
- The misleading test `clicking the close button after openWith returns the FAB to closed (so a fresh open re-prefills)` (which passed even with the original bug because it never asserted state preservation) was **rewritten** into two real persistence tests:
  - `typed draft survives a close→open cycle` — opens with prefill, appends text to the textarea, closes, reopens, asserts the textarea value still contains both.
  - `clause selection context survives close→open` — sets `clauseId / severity / statuteCitation` via `openWith`, closes, asserts they're still present, reopens, asserts again.
- The pre-existing test `openWith seeds the composer + submitting posts the prompt to /api/chat` is unchanged.

**Net:** -1 test replaced + 2 new tests added = **+1 test** in this file.

---

## PR 2 — Tenant-only public UI

### `src/lib/version.ts` (new file)

```ts
export const LEASELENS_VERSION = 'v23.i';
export const LEASELENS_STATUS = 'Live';
```

Hoisted from the hardcoded `Live · v23.i` literal at `src/app/page.tsx:218`. Future deploys bump the constant from a single place. No tests; constants only.

### `src/app/page.tsx` (modified)

**What changed:**
- New imports: `{ env }` from `@/lib/env` (was already imported), `{ LEASELENS_STATUS, LEASELENS_VERSION }` from `@/lib/version`.
- The `Cockpit` header link (originally `{currentRole !== 'Tenant' && ...}`) is now wrapped in `{env.LEASELENS_DEMO_MODE && currentRole !== 'Tenant' && (...)}`. Production deploys (`LEASELENS_DEMO_MODE=false`) never render it.
- The hardcoded `Live · v23.i` literal is replaced with `{LEASELENS_STATUS} · {LEASELENS_VERSION}`.
- The `<RoleSwitcher currentRole={currentRole} />` mount is wrapped in `{env.LEASELENS_DEMO_MODE && (...)}`.
- Comments above each gated block explain the production-vs-demo split.

**Why:** Tenant-only public surface without deleting Reviewer/Admin code paths. Demo mode (set in `playwright.config.ts` for e2e and in any dev `.env.local` that wants to test role switching) keeps everything visible.

### `src/lib/env.ts` — **unchanged**

`LEASELENS_DEMO_MODE` already existed at lines 5-8 with the schema:

```ts
LEASELENS_DEMO_MODE: z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1'),
```

No env-schema change needed; PR 2 only wires new consumers.

### `src/components/auth/RoleSwitcher.tsx` — **unchanged**

The component itself is fine; only its mounting site is gated. Backend role guards (`middleware.ts`, `cockpit/page.tsx`, `audit/rollback`, `ToolCard` verbosity) are also untouched.

### `playwright.config.ts` (modified)

**What changed:**
- Added `LEASELENS_DEMO_MODE: 'true'` to the `webServer.env` block, with a comment explaining that e2e specs (`cockpit-dashboard`, `three-pane-shell`, `role-flows`) exercise role switching and need the demo flag on.

**Why:** Without this, every role-touching e2e spec would break under the new gating. Setting the flag at the Playwright layer keeps the production default (`false` in `.env.local` and `.env.test`) untouched.

### `.env.local`, `.env.test`, `.env.example` — **unchanged**

All three already had `LEASELENS_DEMO_MODE=false`. The flag's default behavior is now "hide role UI."

---

## PR 3 — Six-stage scan lifecycle

### `src/components/lease/scan-lifecycle.ts` (new file)

**Exports:**
- `type ScanLifecycleStage` — string union: `'idle' | 'upload_received' | 'reading_lease' | 'extracting_clauses' | 'checking_clauses' | 'preparing_red_flags' | 'review_ready'`.
- `const LIFECYCLE_STAGES: ScanLifecycleStage[]` — ordered array, length 6, excludes `'idle'`. Used by the UI to render every row in stable order.
- `interface ScanLifecycleSnapshot { stage, index, label, detail, progress }` — derived state shape returned by both the pure function and the hook.
- `interface ScanLifecycleInputs { hasActiveLease, toolEvents, scanProgress, preparingDone }` — pure-function inputs.
- `function computeScanLifecycleStage(inputs: ScanLifecycleInputs): ScanLifecycleSnapshot` — pure derivation; every branch unit-tested.
- `function stageLabel(stage: ScanLifecycleStage): string` — small helper for the UI.
- `function useScanLifecycle(): ScanLifecycleSnapshot` — React hook layer; reads `useChatStream()` and `useScanProgress()`, manages the 650 ms `preparingDone` timer.

**Key behaviors:**
- `idle` returns when (a) no active lease and no scan, or (b) degenerate extract (`phase === 'extracting' && total === 0`). The degenerate case is intentional — a real extract that resolves with zero clauses should fall through to the empty state, not a stuck "Extracting…" forever.
- `upload_received` vs `reading_lease` is gated on `toolEvents.length` while `scanProgress.phase === 'idle'`. The user starts in upload_received; the first tool result of any kind (even a non-extract event) advances them to reading_lease.
- A scan in flight (`scanProgress.phase !== 'idle'`) overrides `hasActiveLease` — useful for test fixtures and rehydration races where `activeLease` may be momentarily null.
- The `preparingDone` flag is owned by the hook via `useEffect` + `setTimeout(650 ms)`. The pure function takes it as an input so tests stay deterministic.

**Cross-module relationship:** This is the **third** scan-derived module alongside `use-scan-progress.ts` (low-level phase machine) and `scan-stages.ts` (thematic clause-type stages used by `ScanTimeline`). They share the same `partitionByLatestExtract` anchor in `use-scan-progress.ts` so there's only ever one answer to "what counts as the current scan."

### `src/components/lease/scan-lifecycle.test.ts` (new file)

11 tests covering every transition:
1. Idle when no lease + no scan in flight.
2. Idle when extract resolved with zero clauses (degenerate).
3. Scan-derived stage when extract has landed even if `hasActiveLease=false` (rehydration fixture).
4. `upload_received` when lease active but no tool events.
5. `reading_lease` when lease active + non-extract tool event present.
6. `extracting_clauses` when phase=extracting with known total; subtext includes the count.
7. `checking_clauses` during grading with M-of-N subtext.
8. `preparing_red_flags` immediately after grading completes (`preparingDone=false`).
9. `review_ready` once `preparingDone=true`.
10. `LIFECYCLE_STAGES` order is stable and contains exactly six entries in the documented order.
11. `index` field corresponds to position in `LIFECYCLE_STAGES`, `-1` for idle.

All pass.

### `src/components/lease/RedFlagsLoadingState.tsx` (new file)

**Component shape:** `RedFlagsLoadingState({ snapshot }: { snapshot: ScanLifecycleSnapshot }): React.JSX.Element | null`. Returns `null` when `snapshot.stage === 'idle'`.

**Render contract:**
- Wrapper `<section data-testid="red-flag-loading-state" aria-label="Lease scan progress" />`.
- Thin progress rail at top: `<div aria-hidden="true">` with a filled inner bar whose width is `((index + 1) / 6) * 100%`.
- `<ol data-testid="red-flag-lifecycle" aria-live="polite">` containing one `<li>` per stage in `LIFECYCLE_STAGES`. Each row carries `data-status` (`complete` / `active` / `pending`) and `data-stage` for test addressability.
- Status icons: `<Check>` for complete, `<Loader2>` with `animate-spin` for active, muted dot for pending. Reduced-motion drops the spin.
- Active-row detail subtext renders below the label in mono small-caps when `snapshot.detail !== null`.
- Row reveal animation: 220 ms ease-out fade + 4 px left-offset slide, 50 ms stagger per row. Honors `useReducedMotion()` — collapses to instant.

**No state of its own.** All state comes from the snapshot prop.

### `src/components/lease/RedFlagsLoadingState.test.tsx` (new file)

6 tests:
1. Renders six rows in `LIFECYCLE_STAGES` order with the documented labels.
2. Marks earlier rows complete, current active, later pending based on `snapshot.index`.
3. Surfaces `snapshot.detail` subtext on the active row (assert "7", "12" both present for `checking_clauses` with `Grading 7 of 12`).
4. `aria-live="polite"` on the list element.
5. Renders nothing (`queryByTestId returns null`) when `snapshot.stage === 'idle'`.
6. When `stage === 'review_ready'`, every row is either complete or active; the review_ready row itself is active.

All pass.

### `src/components/lease/RedFlagReport.tsx` (modified — wiring only, ~5 lines net)

**What changed:**
- New imports: `{ RedFlagsLoadingState }` from `./RedFlagsLoadingState`, `{ useScanLifecycle }` from `./scan-lifecycle`. `RedFlagSkeletonCard` import retained (still used in the partial-grading branch later in the file).
- New local: `const lifecycle = useScanLifecycle();` alongside the existing `const scan = useScanProgress();`.
- The old skeleton-card branch (the `if (gradings.length === 0 && scan.phase === 'extracting' && scan.total > 0)` block) is **replaced** by the lifecycle gate:

```ts
const inFlight =
  lifecycle.stage !== 'idle' &&
  lifecycle.stage !== 'review_ready' &&
  gradings.length === 0;
if (inFlight) {
  return (
    <div className="flex flex-col gap-3" data-testid="red-flag-report-scanning">
      <RedFlagsLoadingState snapshot={lifecycle} />
    </div>
  );
}
```

- `data-testid="red-flag-report-scanning"` is preserved on the outer wrapper so existing tests that locate this branch keep working.
- The mid-grading partial-skeleton block later in the file (lines ~660-680) **was not modified** — it still uses `RedFlagSkeletonCard` to render trailing skeletons for ungraded clauses. That branch only runs after `gradings.length > 0` so it doesn't conflict with the new lifecycle UI.
- The empty-state branch (Paperclip icon + "Red flags will appear here" + example preview + "Also catches" list) is **unchanged**. It's the fallback when `lifecycle.stage === 'idle'` (no lease) or `'review_ready'` (scan finished but no flags landed).

**File size:** ~810 LOC. The planned split into `RedFlagCard` + `RedFlagList` + wrapper was deferred — see `spec.md §6`.

### `src/components/lease/RedFlagReport.test.tsx` (modified)

**What changed:**
- Imports: `within` added to the `@testing-library/react` import (used in the rewritten test).
- The test `renders one skeleton per extracted clause when no gradings yet` was **rewritten** to `renders the 6-stage lifecycle panel when extract has landed but no gradings yet`. It now asserts:
  - The empty-state examples are NOT in the document.
  - `red-flag-lifecycle` is in the document with exactly 6 `<li>` children.
  - The `extracting_clauses` row has `data-status="active"`.
  - The row's text contains the live count "3".
- The pre-existing test `renders real cards plus trailing skeletons for ungraded clauses` was unchanged — that branch still uses `RedFlagSkeletonCard`, and the new lifecycle UI does not run when `gradings.length > 0`.

**Net:** 0 tests added (1 rewritten in place).

### `src/components/lease/ParserResultsShell.test.tsx` (modified)

**What changed:**
- The test `renders the results stack with RedFlagReport and ClausesList in order; no inline chat slot in 26c` was updated. With Sprint 27 in place, mounting `ParserResultsShell` with an `activeLease` triggers the lifecycle panel instead of the bare empty state, so the assertion changed from `red-flag-report-empty` → `red-flag-report-scanning`. The "order: red flags first, then clauses" check is updated to use the new test ID.

**Net:** 0 tests added.

### `src/components/lease/use-scan-progress.ts` — **unchanged**

The new `useScanLifecycle` hook is layered **on top of** `useScanProgress`; the low-level hook keeps its existing contract. No prop, type, or behavior change.

### `src/components/lease/scan-stages.ts` — **unchanged**

`ScanTimeline` (in chat for Tenant viewers) still uses `useScanStages` for thematic per-clause-type rows. The two stage models live side by side: `scan-stages.ts` for granular thematic stages (ScanTimeline), `scan-lifecycle.ts` for the 6-stage narrative panel (RedFlagReport).

---

## File index (Sprint 27 surface, alphabetical)

| File | Status | Lines changed (approx) | PR |
|---|---|---|---|
| `docs/_specs/sprint-27-production-pivot/impl.md` | new | this file | meta |
| `docs/_specs/sprint-27-production-pivot/spec.md` | new | (see file) | meta |
| `playwright.config.ts` | modified | +9 | 2 |
| `src/app/page.tsx` | modified | +17 / -6 | 2 |
| `src/components/chat/AssistantFab.client.test.tsx` | modified | +60 / -10 | 1 |
| `src/components/chat/AssistantFab.client.tsx` | modified | +30 / -10 | 1 |
| `src/components/chat/AssistantFab.integration.test.tsx` | modified | +85 / -35 | 1 |
| `src/components/chat/AssistantFabContext.test.tsx` | modified | +35 / -10 | 1 |
| `src/components/chat/AssistantFabContext.tsx` | modified | +25 / -5 | 1 |
| `src/components/lease/ParserResultsShell.test.tsx` | modified | +5 / -5 | 3 |
| `src/components/lease/RedFlagReport.test.tsx` | modified | +25 / -7 | 3 |
| `src/components/lease/RedFlagReport.tsx` | modified | +15 / -10 | 3 |
| `src/components/lease/RedFlagsLoadingState.test.tsx` | new | ~115 | 3 |
| `src/components/lease/RedFlagsLoadingState.tsx` | new | ~165 | 3 |
| `src/components/lease/scan-lifecycle.test.ts` | new | ~170 | 3 |
| `src/components/lease/scan-lifecycle.ts` | new | ~207 | 3 |
| `src/lib/version.ts` | new | 10 | 2 |

**Totals:** 7 new files, 9 modified, ~1100 lines added (incl. tests + docs), ~100 removed.

---

## Why some things you might expect to find are NOT here

- **No changes to `middleware.ts`.** Backend role guards still work as before. The Tenant-only public UI is achieved entirely by gating the consumer in `page.tsx`.
- **No changes to `RoleSwitcher.tsx`, `/cockpit` page, `audit rollback`, `ToolCard` verbosity, or `DEMO_USERS`.** Same reason.
- **No changes to the chat API, NDJSON envelope, or `extract_clauses` / `grade_clause_severity` tool contracts.** Pure UI sprint.
- **No changes to `LeaseLensWorkspaceShell.tsx`.** Already legacy, scheduled for Sprint 26d removal.
- **No file split of `RedFlagReport.tsx`.** Deferred — see spec §6.
- **No changes to `ChatComposer.tsx` or `ChatUI.tsx`.** The existing `lastPrefillRef` re-sync (ChatComposer:56-61) handled the new flow correctly; removing the `key` prop on `<ChatUI>` was sufficient.
