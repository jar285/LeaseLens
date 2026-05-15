# Sprint 23c — Implementation QA

**Status:** Implementation complete (Phases 1-4 shipped 2026-05-13; Phase 5 polish addendum shipped same day).
**Date:** 2026-05-13.
**Baseline tests at start:** 765/765.
**Tests at finish:** 782/782 (+17: 15 from the Phases 1-4 implementation + 2 from the Phase 5 polish addendum).

## Phase 0 — Pre-flight

- [x] `git status` clean apart from `handoff.md`.
- [x] Baseline `npm test` → 765/765 green.
- [x] Baseline `npm run lint` → 0 errors.
- [x] Baseline `npm run build` succeeds.

## Phase 1 — ChatEmptyState compact card

**TDD red-green:**

- [x] RED: 4 tests added (badge h-12, H1 text-2xl/sm:text-3xl, description max-w-sm/mb-8, starter cards p-3.5); all failing.
- [x] GREEN: sizes reduced per spec §3b; tests pass.
- [x] All existing 3 empty-state tests still pass (heading, prompts, four-cards).

**Visual delta:**

| Element | Before | After |
|---|---|---|
| Brand badge | `h-14 w-14` | `h-12 w-12` |
| H1 size | `text-3xl sm:text-4xl` | `text-2xl sm:text-3xl` |
| Description | `max-w-md mb-10` (15px) | `max-w-sm mb-8` (14px) |
| Starter cards padding | `p-4` | `p-3.5` |

## Phase 2 — UploadedLeaseCard + transcript routing

**TDD red-green:**

- [x] RED: 6 `UploadedLeaseCard` tests (testid, filename, meta, chip rendering, chip dispatch, pluralisation, meta absence) + 1 `ChatTranscript` route test added; all failing.
- [x] GREEN: new file created (`src/components/lease/UploadedLeaseCard.tsx`); transcript route applied; tests pass.
- [x] Synthetic intro renders exactly once (verified via `getAllByText(...).length === 1`).
- [x] `ActiveLeaseRef` interface extended with optional `page_count` and `clause_count`; `LeaseLensWorkspaceShell.handleUploaded` forwards them to `setContextLease`.

## Phase 3 — Composer command-bar polish

**TDD red-green:**

- [x] RED: 4 tests added (min-h-11, placeholder mentions clause/rewrite/slash, kbd visible empty, kbd hidden when typing); 4 failing.
- [x] GREEN: `MIN_TEXTAREA_HEIGHT` bumped from 38→44; placeholder updated; `<kbd data-testid="composer-slash-hint">` added with opacity-gated visibility on `text.length`.
- [x] Existing Enter/Shift+Enter/lock/resize tests still pass (the prior 38 assertions updated to 44).
- [x] Biome `aria-hidden on focusable` false-positive on `<kbd>` resolved by dropping the aria-hidden attribute; the placeholder ("type / for actions") provides screen-reader context.

## Phase 4 — ScanTimeline + ActivityDrawer polish

**No TDD red-green (visual-only).**

- [x] `ScanTimelineRow.tsx` — stage label uses `font-medium tracking-tight`.
- [x] `ScanTimeline.tsx` — "Show what I did" toggle gets `rounded-md px-1.5 hover:bg-surface-muted` for a visible hover affordance.
- [x] `ActivityDrawer.tsx` — top border changed from `border-neutral-100 dark:border-neutral-800` to the cleaner `border-border-hairline` token (auto-flips at `:root.dark`).
- [x] All 26 existing tests across the three files still pass.

## Acceptance walk

- [x] AC #1 compact empty state — unit-tested via 4 size/spacing assertions.
- [x] AC #2 uploaded lease card with chips — 6 unit tests + 1 route test cover.
- [x] AC #3 composer command-bar — 4 unit tests cover min-h-11, placeholder, kbd visibility.
- [x] AC #4 scan timeline polish — existing tests preserved (visual-only).
- [x] AC #5 synthetic-summary suppression preserved — `isStreaming` + `modelProducedClosingReply` checks untouched at `ChatTranscript.tsx:106-110`; all 17 transcript tests pass.
- [x] AC #6 disclaimer bold preserved — system-prompt-driven; not touched.
- [x] AC #7 role-gated rendering preserved — `ChatMessage.tsx:225-226` not modified; existing role-gating tests pass.
- [x] AC #8 test sweep — 780/780 ≥ 778 target.
- [ ] AC #9 reduced motion — manual smoke pending.
- [ ] AC #10 dark mode — manual smoke pending.
- [ ] AC #11 keyboard — manual smoke pending.

## Test delta

| Metric | Before | After | Delta |
|---|---|---|---|
| Test files | 99 | 100 | +1 (UploadedLeaseCard.test.tsx) |
| Total tests | 765 | 780 | +15 |
| Lint errors | 0 | 0 | 0 |
| Build | green | green | unchanged |

Breakdown of +15:
- Phase 1 (empty state): +4 (badge size, H1, description, card padding)
- Phase 2 (uploaded card + route): +7 (6 card tests + 1 transcript route test)
- Phase 3 (composer): +4 (min-h-11, placeholder, kbd visible, kbd hidden)
- Phase 4 (timeline polish): 0 (visual-only)
- Total: 4+7+4+0 = **15**

## Commit log

| Commit | SHA | Description |
|---|---|---|
| s23c.0 | d3e53b6 | docs(s23c): sprint-23c conversation-workspace specs and QA scaffolds |
| s23c.1 | (pending — awaiting smoke) | refactor(s23c.1): tighten ChatEmptyState to compact premium card |
| s23c.2 | (pending — awaiting smoke) | feat(s23c.2): UploadedLeaseCard component + transcript routing |
| s23c.3 | (pending — awaiting smoke) | refactor(s23c.3): command-bar polish for ChatComposer |
| s23c.4 | (pending — awaiting smoke) | refactor(s23c.4): visual polish for ScanTimeline and ActivityDrawer |
| s23c.5 | (pending — awaiting smoke) | docs(s23c): record implementation audit in impl-qa.md |

## Sign-off

- Implementer: jar285 (via Claude Opus 4.7 / 1M context)
- Reviewer: _pending_
- Date: 2026-05-13

---

## Phase 5 — UploadedLeaseCard fade-in (polish addendum)

**Surfaced during the user's smoke walk after the Phases 1-4 commits landed.** The synthetic intro card popped in **instantly** when `scan-narrative.computeScanNarrative()` produced the intro on upload-parse — no entry animation, in contrast to the rest of the conversation surface (ChatEmptyState card stagger, ChatMessage bubble entry, RedFlag card slide-in all use 200-350ms motion).

**Fix:** Wrap the card root in `motion.div` with the standard entry curve (`opacity: 0 → 1`, `y: 8 → 0`, `duration: 0.25`, ease `[0.22, 1, 0.36, 1]` — the `ease-out-soft` curve used by ChatEmptyState card stagger and ChatMessage). `useReducedMotion()` gate renders a plain `<div>` with `data-motion="off"`; the animated path carries `data-motion="on"` for test introspection.

**TDD red-green:**

- [x] RED: 2 new tests added (data-motion attribute reflects animate state; content + chip dispatch unchanged in the motion path); 1 failing (the data-motion attribute didn't exist).
- [x] GREEN: motion wrapper added, `useReducedMotion()` + mounted-effect gate applied; both tests pass.
- [x] All 6 existing UploadedLeaseCard tests still pass.

**Visual delta:**

| Element | Phases 1-4 end | Phase 5 end |
|---|---|---|
| Card mount | Instant pop-in | 250ms fade-in + 8px y-translate |
| Reduced motion | Same instant pop-in | Plain DOM, instant (no animation, but also no jank) |

**Files touched:**

| File | Change |
|---|---|
| `src/components/lease/UploadedLeaseCard.tsx` | Add `motion` + `useReducedMotion` imports, mount gate, animate-vs-static branch |
| `src/components/lease/UploadedLeaseCard.test.tsx` | +2 tests (motion-on attribute, no-regression check) |

**Test delta:**

| Metric | Before | After | Delta |
|---|---|---|---|
| UploadedLeaseCard tests | 6 | 8 | +2 |
| Total tests | 794 (with sprint-23e in working tree) | 796 | +2 |
| Lint errors | 0 | 0 | 0 |
| Build | green | green | unchanged |
