# Sprint 23c — Conversation Workspace — Execution Plan

**Spec:** [spec.md](./spec.md).
**Branch:** `feature/ui`.
**Estimated phases:** 4. TDD-driven where the change is testable in jsdom (markup, role-gating, follow-up-chip dispatch); visual-only changes verified by smoke walk.

---

## Phase 0 — Pre-flight

1. `git status` clean apart from `handoff.md` (untracked) and `docs/_specs/sprint-23c-*` (just created).
2. Baseline: `npm test` (expect 765/765), `npm run lint` (0 errors), `npm run build` (green).
3. Re-read [ChatEmptyState.tsx](../../../src/components/chat/ChatEmptyState.tsx), [ChatTranscript.tsx](../../../src/components/chat/ChatTranscript.tsx), [scan-narrative.ts](../../../src/components/lease/scan-narrative.ts), [ChatComposer.tsx](../../../src/components/chat/ChatComposer.tsx), [ScanTimeline.tsx](../../../src/components/lease/ScanTimeline.tsx) end-to-end.

## Phase 1 — Compact `ChatEmptyState`

**Files touched:** [src/components/chat/ChatEmptyState.tsx](../../../src/components/chat/ChatEmptyState.tsx), [src/components/chat/ChatEmptyState.test.tsx](../../../src/components/chat/ChatEmptyState.test.tsx).

**TDD red-green:**

1. RED — extend the existing test file with assertions that:
   - Brand badge wrapper uses `h-12 w-12` (was `h-14 w-14`).
   - H1 uses `sm:text-3xl` (was `sm:text-4xl`).
   - Description uses `max-w-sm` (was `max-w-md`) and `mb-8` (was `mb-10`).
   - Each starter card uses `p-3.5` (was `p-4`).
2. GREEN — apply the size reductions; preserve the LeaseLensMark scan/pulse animations, the four starter cards, the how-it-works strip, and the disclaimer pill.
3. REFACTOR — verify reduced-motion fallback still renders plain DOM; verify card click still fires `onSelectPrompt`.

**Verification:** existing `ChatEmptyState.test.tsx` tests still pass. Smoke check at 1080px viewport: hero + cards + strip + disclaimer all visible without scroll.

## Phase 2 — `UploadedLeaseCard` (new component) + transcript routing

**Files touched:**
- NEW: [src/components/lease/UploadedLeaseCard.tsx](../../../src/components/lease/UploadedLeaseCard.tsx)
- NEW: [src/components/lease/UploadedLeaseCard.test.tsx](../../../src/components/lease/UploadedLeaseCard.test.tsx)
- [src/components/chat/ChatTranscript.tsx](../../../src/components/chat/ChatTranscript.tsx) (routing)
- [src/components/chat/ChatTranscript.test.tsx](../../../src/components/chat/ChatTranscript.test.tsx) (route assertion)

**TDD red-green:**

1. RED — write `UploadedLeaseCard.test.tsx` from scratch: renders filename in a mono accent span; renders "N pages · M clauses" meta; renders four action chips by `label` from prompts; clicking a chip fires `onSelectPrompt(prompt)`.
2. RED — extend `ChatTranscript.test.tsx`: when the merged messages contain a `synthetic: true, source: 'intro'` entry, the rendered output contains a `data-testid="uploaded-lease-card"` and NOT the regular `data-testid="chat-message"` for that entry.
3. GREEN — implement `UploadedLeaseCard` (pure presentation, no state). Update `ChatTranscript`'s render loop to detect synthetic intro messages and route them to `UploadedLeaseCard` instead of `ChatMessage`. Use the merged-message metadata (synthetic + source) to make the routing decision.
4. REFACTOR — ensure the synthetic intro still respects all existing rules (one intro at the top, scan-narrative still produces the message, no double-rendering).

**Verification:** new test file passes. ChatTranscript tests pass. Smoke: upload sample lease → see the new card with action chips → click "Run the standard scan" → scan fires.

## Phase 3 — `ChatComposer` command-bar polish

**Files touched:** [src/components/chat/ChatComposer.tsx](../../../src/components/chat/ChatComposer.tsx), [src/components/chat/ChatComposer.test.tsx](../../../src/components/chat/ChatComposer.test.tsx).

**TDD red-green:**

1. RED — extend existing test:
   - The textarea has `min-h-[44px]` (was 38).
   - The placeholder text matches `/clause.*rewrite.*\/ for actions/i`.
   - When the textarea is empty, a `<kbd>` element with `/` content is present (slash-command hint).
   - When the textarea has content, the `<kbd>` is hidden (either absent or has `aria-hidden` + `opacity-0`).
2. GREEN — bump min-height to 44px; update placeholder; add a positioned `<kbd>` element inside the wrapper; gate visibility on `text === ''`.
3. REFACTOR — verify Enter sends; Shift+Enter inserts newline; lock-on-stream disables; send button motion behaviour unchanged.

**Verification:** tests pass. Smoke: composer placeholder reads new copy; `/` kbd visible at idle; typing hides the kbd; sending works as before.

## Phase 4 — `ScanTimeline` + `ActivityDrawer` polish (visual only)

**Files touched:** [src/components/lease/ScanTimeline.tsx](../../../src/components/lease/ScanTimeline.tsx), [src/components/lease/ScanTimelineRow.tsx](../../../src/components/lease/ScanTimelineRow.tsx), [src/components/chat/ActivityDrawer.tsx](../../../src/components/chat/ActivityDrawer.tsx).

**Why no TDD red-green:** these changes are pure visual polish (typography weight, border tightness, hover state) with no testable behavior change. The existing test suites cover the structural contract — we run them to confirm no regression.

**Changes:**

- `ScanTimeline.tsx`: "Show what I did" toggle gets `hover:bg-surface-muted` on its hit region.
- `ScanTimelineRow.tsx`: stage label uses `font-medium tracking-tight` (was default tracking).
- `ActivityDrawer.tsx`: top border replaced with hairline (`border-t border-border-hairline` from existing tokens) for a calmer visual separation.

**Verification:** existing tests pass. Smoke walk: run scan → timeline rows look tighter; "Show what I did" has a hover; ActivityDrawer expands without a heavy line break.

## Phase 5 — Full smoke + commit sequence

1. `npm test && npm run typecheck && npm run lint && npm run build` — all green.
2. Manual smoke walk per spec §4 AC #1–11.
3. Update `impl-qa.md` with per-phase change ledger, test deltas, commit-log placeholders.
4. **HALT for user smoke walk via `npm run dev`** before any implementation commit.
5. After user approval, commit in the following sequence (NOT pushed):

```txt
refactor(s23c.1): tighten ChatEmptyState to compact premium card
feat(s23c.2): UploadedLeaseCard component + transcript routing
refactor(s23c.3): command-bar polish for ChatComposer (placeholder + slash hint)
refactor(s23c.4): visual polish for ScanTimeline and ActivityDrawer
docs(s23c): record implementation audit in impl-qa.md
```

---

## File map

| Phase | File | Change type |
|---|---|---|
| 1 | `src/components/chat/ChatEmptyState.tsx` | Size + spacing reductions |
| 1 | `src/components/chat/ChatEmptyState.test.tsx` | Assertions for new sizes |
| 2 | `src/components/lease/UploadedLeaseCard.tsx` | NEW component |
| 2 | `src/components/lease/UploadedLeaseCard.test.tsx` | NEW test file |
| 2 | `src/components/chat/ChatTranscript.tsx` | Route synthetic intro to new card |
| 2 | `src/components/chat/ChatTranscript.test.tsx` | Route assertion |
| 3 | `src/components/chat/ChatComposer.tsx` | min-height + placeholder + slash kbd |
| 3 | `src/components/chat/ChatComposer.test.tsx` | Assertions for new placeholder + kbd |
| 4 | `src/components/lease/ScanTimeline.tsx` | Hover + typography polish |
| 4 | `src/components/lease/ScanTimelineRow.tsx` | Typography polish |
| 4 | `src/components/chat/ActivityDrawer.tsx` | Hairline border |
| 5 | `docs/_specs/sprint-23c-conversation-workspace/impl-qa.md` | Implementation audit |

## Test impact

- Expected to grow: +4 ChatEmptyState (size/spacing), +5 UploadedLeaseCard (filename/meta/chips/dispatch), +1 ChatTranscript (route), +3 ChatComposer (min-h/placeholder/kbd). Net ~+13 tests.
- No deletions.
- After sprint-23c: expected total ≥ 778.
