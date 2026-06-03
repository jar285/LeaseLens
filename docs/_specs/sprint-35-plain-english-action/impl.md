# Sprint 35 — Implementation Notes & QA Report

"Plain English" red-flag card action. Spec: [`spec.md`](spec.md). Design source: a 4-lens power-words
panel (all four returned **"add-with-changes"**). Locked at the Spec-QA gate: **D1 = relabel both**,
**D2 = keep existing pill size** (sub-44px noted as carry).

## What shipped

All in [`RedFlagReport.tsx`](../../../src/components/lease/RedFlagReport.tsx) — no route/API/prompt-server
changes, one new lucide glyph.

- **New `plainEnglishPromptFor(g)`** helper next to the other two (centralized). Jargon-free,
  tenant-facing, and **grounded**: keeps the clause label + **verbatim `statute_citation`** and instructs
  *"do not change or soften what the law actually requires — just make the meaning easy to understand."*
- **New "Plain English" pill** in `CardActions` — `Languages` glyph, testid `red-flag-explain-plain`,
  `type="button"` + `e.stopPropagation()`, reuses `pillClass`. Wired via `onExplainPlain` →
  `fab.openWith({ plainEnglishPromptFor(g), clauseId, severity, statuteCitation })`.
- **Relabel (D1):** the existing statute-walkthrough pill "Explain" → **"What the law says"**, icon
  `MessageSquare → BookOpen` (signals "the source/statute"). **Testid `red-flag-explain` + prompt
  (`explainPromptFor`) unchanged** → unit + e2e selectors stay green; only the visible text + icon move.
- **Order:** View on page N → Plain English → What the law says → Draft email (orient → understand
  simply → go to source → act). Wired in **both** `CardActions` call sites (animated + static branch).
- `MessageSquare` import dropped (now unused); `BookOpen` + `Languages` added (alpha order). Doc comment
  above `CardActions` updated (3→4 buttons + the relabel rationale).

## Tests (TDD red → green) — `Sprint 35` block in `RedFlagReport.test.tsx`

Red first (new helper undefined; no `red-flag-explain-plain`; no "What the law says"), then green.

| Test | Pins |
|---|---|
| `plainEnglishPromptFor` wording | contains "plain english" + "jargon" + "tenant" + **verbatim citation**; matches "do not change/soften"; **`.not.toMatch`** law-loosening verbs (`ignore\|loosen\|disregard\|not enforceable\|doesn't apply\|you can waive`) |
| `explainPromptFor` / `draftEmailPromptFor` backfill | statute-walkthrough + email pins (all three helpers locked) |
| Plain English pill renders + wires | `red-flag-explain-plain` is a button, accessible name `/plain english/i`; click → `fab.state==='drawer'`, selection `{clauseId, severity, statuteCitation}`, `pendingPrompt` contains "plain english" **and the citation** (grounding pin) |
| relabel | `red-flag-explain` now has accessible name `/what the law says/i`; **no bare "Explain" pill** remains; the two explanation pills are distinct nodes; clicking it still seeds the statute walkthrough |

Suite **1139 → 1144** (+5).

## Gates (final)

| Gate | Result |
|---|---|
| `npm run lint` | **PASS** — 289 files (one Biome line-wrap autofix in the test) |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS** — **1144 / 1144** |
| `npm run build` | **PASS** — compiled 6.9s |

## Live verify (Playwright, seeded sample lease)

Expanded a red-flag card:

| Check | Result |
|---|---|
| Pills + order | **View on page · Plain English · What the law says · Draft email** (4 pills, correct order) |
| Desktop (1280px) | single row |
| Mobile (390px, ~286px column) | wraps to **exactly 2 rows**, never a third (`flex-wrap` degrades cleanly) |
| "Plain English" click | drawer opens; composer seeded: *"…in plain English, without legal jargon, as if to a tenant… Stay grounded in {citation}: do not change or soften what the law actually requires…"* — jargon-free, tenant-facing, citation present ✓ |
| App console errors | **0** (only dev-only HMR-websocket reconnect noise) |

Screenshot: [`screenshots/s35-card-actions-row.png`](screenshots/s35-card-actions-row.png).

### Live chat verification (all three actions, real model, clause "Subletting · §6")

Each of the three chat-producing pills was clicked → drawer opened with the seeded prompt → submitted
(Enter) → streamed reply captured. The 4th pill ("View on page") only scrolls the PDF, so it produces
no chat turn and was excluded. Responses were **distinct and grounded**:

| Action | Prompt seeded | Reply (verbatim heading) | Screenshot |
|---|---|---|---|
| **Plain English** | "…in plain English, without legal jargon, as if to a tenant…" | *"Subletting · §6 — Plain English Explanation"* — everyday language, "what this means for **you**", concrete next steps | [`s35-chat-1-plain-english.png`](screenshots/s35-chat-1-plain-english.png) |
| **What the law says** | "…Reference {citation} verbatim and walk me through what the statute says." | *"Subletting · §6 — Grounded in NJ Law"* — quotes the corpus **verbatim** ("reasonable-consent standard is implied…"), then aligns the clause | [`s35-chat-2-what-the-law-says.png`](screenshots/s35-chat-2-what-the-law-says.png) |
| **Draft email** | "Draft a polite negotiation email… Cite {citation} and propose a specific edit." | An **email card** (`draft_negotiation_email` tool): *"Subject: Request to Clarify Subletting and Liability Language"* + body proposing two concrete edits | [`s35-chat-3-draft-email.png`](screenshots/s35-chat-3-draft-email.png) |

The plain-English vs. statute lenses came back **noticeably different** in tone + framing — confirming
the relabel/differentiation was the right call. 0 application console errors (only dev HMR noise).

**UX finding (pre-existing, not introduced here):** with the FAB drawer open, it overlaps the
right-column cards and **intercepts pointer events** — a second card action can't be clicked until the
drawer is closed. Out of scope for Sprint 35; flagged as a candidate follow-up (card actions should
re-point the already-open drawer, or the drawer should pass through pointer events outside its panel).

## Spec alignment & drift

| Spec item | Status |
|---|---|
| New action added; distinct from statute walkthrough | **DONE** |
| Label "Plain English"; relabel "Explain" → "What the law says" (D1) | **DONE** |
| Icons `Languages` (new) + `BookOpen` (statute) | **DONE** |
| Grounded prompt (keeps citation; simplify language not law) | **DONE** (unit-pinned + live) |
| Order plain-English-first; wired both call sites | **DONE** |
| Testid `red-flag-explain-plain`; keep `red-flag-explain` on relabeled pill | **DONE** |
| Keep existing pill size (D2) | **DONE** |

No drift.

## Sprint 35.1 — verdict headline typography (follow-up polish)

The red-flag verdict line (*"Low risk — 3 findings reviewed."*, [`red-flag-verdict`](../../../src/components/lease/RedFlagReport.tsx)) was typeset as body text (`text-sm font-medium`, Geist Sans) — flat for the load-bearing "is this lease bad?" answer. Promoted it to the brand's editorial-headline face per [MASTER.md](../../../design-system/MASTER.md) §typography (Source Serif 4 = headlines only): `text-balance font-serif text-lg font-bold tracking-tight`. Pure className change, no verdict logic touched. **+1 regression test** pins the editorial treatment (font-serif + font-bold + tracking-tight, not `text-sm`) so it can't silently revert to body sans. Suite **1144 → 1145**; gates green. Live-verified: computed `Source Serif 4 / 700 / 18px / -0.45px tracking` — [`screenshots/s35.1-verdict-editorial-serif.png`](screenshots/s35.1-verdict-editorial-serif.png).

## Carries / out of scope

- **Sub-44px touch target** (D2): pre-existing pattern (shared `pillClass` + duplicate in
  `GradingDetailBlock.tsx:138`) — not fixed here; a future a11y pass should raise the whole row to the
  44px floor in one coordinated change.
- **`GradingDetailBlock` parity:** the clause-detail block has the same pill row but no Plain English
  action — a possible consistency follow-up.
- **Row clutter (Rams):** a 5th action would push `CardActions` toward needing a "More" menu — flag, not
  pre-build.
- **e2e comments:** `tests/e2e/fab-assistant.spec.ts:7-9` still describe the button as "Explain"; the
  selector (testid) is unchanged so the test passes, but the comment could be refreshed for clarity.

## How to re-verify locally

```bash
npm test src/components/lease/RedFlagReport.test.tsx   # Sprint 35 block
npm run lint && npm run typecheck && npm run build
# Live: npm run dev → expand a red-flag card → 4 pills; "Plain English" opens the
#   drawer with a jargon-free, citation-bearing prompt; "What the law says" opens the walkthrough.
```
