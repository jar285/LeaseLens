# Sprint 35 — "Plain English" red-flag card action

> **Draft for the Spec-QA gate — no code yet.** Synthesised from a 4-lens power-words panel
> (Norman+Krug · Rams+Wathan/Schoger · WCAG+HIG · Kent C. Dodds+Source-Grounded). **All four returned
> "add-with-changes"** — the action is worth adding, with one important refinement to the label.
> Continues the Sprint 26c card-action line.

## Context — the request and the catch

Add a quick-action to the expanded red-flag card that explains the flagged clause **in plain English**
for a non-lawyer tenant. The catch the panel unanimously surfaced: the row **already** has an
**"Explain"** pill, and that one is *not* plain English — `explainPromptFor(g)`
([RedFlagReport.tsx:54-58](../../../src/components/lease/RedFlagReport.tsx#L54-L58)) seeds a
**statute-verbatim walkthrough**: *"Reference {citation} verbatim and walk me through what the statute
says."*

So two design facts drive everything:

1. The new action is **genuinely distinct** (jargon-free tenant language vs. statute walkthrough) — it
   fits the "parser-first, tenant-facing" mission. Worth adding. ✓
2. The literal label **"Explain in Plain English" is the wrong label**. All four lenses flagged it:
   too long for the 11px pill (`pillClass`, [L814](../../../src/components/lease/RedFlagReport.tsx#L814))
   so it wraps the flex-wrap row, **and** it shares the leading word "Explain" with the existing pill —
   a Norman/Krug *signifier collision* (two adjacent "Explain*" buttons a tenant can't tell apart) and a
   screen-reader near-duplicate name. The fix is a shorter, distinct label.

## The map (verified)

| Concern | Where | Now |
|---|---|---|
| Action row | [RedFlagReport.tsx:802-860](../../../src/components/lease/RedFlagReport.tsx#L802-L860) `CardActions` | 3 pills: View on page N · Explain · Draft email |
| Shared pill style | [L814](../../../src/components/lease/RedFlagReport.tsx#L814) `pillClass` | `px-2.5 py-1 text-[11px]` + accent hover + `focus-visible:ring-2 ring-accent-300`. **Sub-44px** (existing pattern). Also duplicated in [GradingDetailBlock.tsx:138](../../../src/components/lease/GradingDetailBlock.tsx#L138). |
| Prompt helpers | [L54-63](../../../src/components/lease/RedFlagReport.tsx#L54-L63) | `explainPromptFor` (statute walkthrough) + `draftEmailPromptFor`; centralized, test-pinned |
| Two call sites | [L614-633](../../../src/components/lease/RedFlagReport.tsx#L614-L633) (animated) + [L650-669](../../../src/components/lease/RedFlagReport.tsx#L650-L669) (static) | **Both** render `CardActions` — both must get the new prop |
| Existing test pin | [RedFlagReport.test.tsx:834](../../../src/components/lease/RedFlagReport.test.tsx#L834) | asserts `pendingPrompt` contains `'explain'` — pins the **prompt**, not the label |
| e2e | [fab-assistant.spec.ts:108](../../../tests/e2e/fab-assistant.spec.ts#L108) | clicks by **testid** `red-flag-explain` (not by visible text) |

→ Both the unit test and e2e key off the **prompt string + testid**, not the visible label. So the
existing button can be **relabeled without breaking the suite** as long as we keep its testid
(`red-flag-explain`) and its prompt (still starts with "Explain…").

## Panel consensus (locked by the panel)

1. **Add the action.** Distinct intent; tenant-facing. ✓ (4/4)
2. **New label = "Plain English"**, not "Explain in Plain English". Fits the 11px pill, balances the
   row, and drops the colliding "Explain" stem. (4/4)
3. **Icon = lucide `Languages`** (translate "legalese → everyday words" — a clean Susan-Kare metaphor,
   distinct from the speech-bubble `MessageSquare`). Panel explicitly **rejected `Sparkles`** ("magic"
   framing undercuts the *grounded, not invented* contract; already rejected as off-brand in
   `ChatEmptyState.tsx:122`). (Rams/Wathan + WCAG)
4. **Grounding contract.** `plainEnglishPromptFor(g)` must keep the clause label **and verbatim
   `statute_citation`**, and instruct *simplify the **language**, do not change/soften what the law
   requires*. Pin it with a wording test (positive: label + citation + "plain English"; negative: no
   law-loosening verbs). (Kent + Source-Grounded)
5. **Order:** `View on page N → Plain English → (statute pill) → Draft email` — orient → understand
   simply → go deeper → act; plain-English first matches parser-first/jargon-last. (4/4)
6. **Testid** `red-flag-explain-plain`; `e.stopPropagation()` + `type="button"` + `aria-hidden` icon;
   reuse `pillClass`. Wire `onExplainPlain` in **both** call sites. (4/4)

## Spec (the recommended build)

### 1. New prompt helper — `plainEnglishPromptFor(g)` next to L54-63

```ts
export function plainEnglishPromptFor(g: GradingResult): string {
  const label = clauseLabel(g);
  const severityWord = SEVERITY_LABEL[g.severity].toLowerCase();
  return `Explain the ${severityWord} concern with ${label} in plain English, without legal jargon, as if to a tenant with no legal background. Stay grounded in ${g.statute_citation}: do not change or soften what the law actually requires — just make the meaning easy to understand. Tell me in everyday terms what this means for me and what I can do about it.`;
}
```

Keeps the **same** `clauseLabel` + verbatim `statute_citation` the other two helpers use → the RAG
anchor survives into the seeded prompt.

### 2. New pill in `CardActions` — "Plain English"

A 4th button mirroring the existing pills exactly: `pillClass`, `type="button"`, `e.stopPropagation()`
then `onExplainPlain()`, `<Languages className="h-3 w-3" aria-hidden="true" />`, testid
`red-flag-explain-plain`. Add a `onExplainPlain: () => void` prop to `CardActions`.

### 3. Wire both call sites (L614 + L650)

```tsx
onExplainPlain={() =>
  fab.openWith({
    initialPrompt: plainEnglishPromptFor(g),
    clauseId: g.clause_id,
    severity: g.severity,
    statuteCitation: g.statute_citation,
  })
}
```

### 4. Disambiguate the existing "Explain" (Decision D1 — see gate)

The existing pill is a statute walkthrough, so the strongest mental model is **two clearly-different
lenses**: *Plain English* vs. *the statute*. **Recommended:** relabel "Explain" → **"What the law
says"** + change its icon `MessageSquare → BookOpen` (signals "the source/statute"). **Keep its testid
`red-flag-explain` and prompt** (still starts with "Explain") → unit + e2e stay green; only visible
text + icon change. Update the descriptive comments in `tests/e2e/fab-assistant.spec.ts:7-9` for future
readers (no assertion change).

## Decisions to lock at the Spec-QA gate

- **D1 — labels / relabel scope (the real fork).** You originally said *"Explain in Plain English"*; all
  four lenses say that exact label is too long + collides with the existing "Explain". Options at the
  gate. I recommend **relabel both** (cleanest mental model), but it's your call.
- **D2 — touch target (a11y vs. scope).** The row's pills are **sub-44px** (existing pattern, shared
  `pillClass`, also duplicated in `GradingDetailBlock.tsx:138`). WCAG lens says "fix it now" (add
  `min-h-11`); Rams/Norman say "don't widen blast radius in a button-add slice." Gate decision.

Everything in **Panel consensus** (icon, grounding, order, testid, two call sites) is locked by the
panel and not re-opened here.

## Tests (TDD red→green, colocated in `RedFlagReport.test.tsx`)

| Test | Pins |
|---|---|
| `plainEnglishPromptFor` wording | contains clause label + **verbatim citation** + a plain-language signifier; **`.not.toMatch`** law-loosening verbs (`ignore\|loosen\|disregard\|doesn't apply\|not enforceable`) |
| new pill renders | after expand, `getByTestId('red-flag-explain-plain')` is a `button`; accessible name `/plain english/i`; distinct from the statute pill's name |
| openWith wiring (grounding pin) | click the new pill → `fab.state==='drawer'`, `selection.{clauseId,severity,statuteCitation}` set, `pendingPrompt` contains "plain english" **and still contains the citation** (the source-grounding contract) |
| existing pill still wired | the relabeled statute pill (testid `red-flag-explain`) still seeds `explainPromptFor` (regression) |
| backfill | exact-string pins for `explainPromptFor` + `draftEmailPromptFor` so all three helpers are locked |

> **Two-call-site guard:** happy-dom renders only the **static** branch (`animate = mounted && !reduced`).
> The spec requires the new `onExplainPlain` in **both** L614 + L650 blocks; a test comment names this so
> the animated branch can't silently go unwired.

## A11y checklist

- New button: `type="button"`, `e.stopPropagation()` (sits inside the card toggle), `focus-visible`
  ring (from `pillClass`), icon `aria-hidden` so the **visible label is the accessible name** → label
  must fully convey the action (hence "Plain English", never bare "Explain").
- No new motion. Distinct accessible names for the two explanation pills (no SR duplicate).
- Touch target: per **D2**.

## Verification

1. TDD red→green. 2. Gates: `npm run lint && npm run typecheck && npm test && npm run build` (suite
grows). 3. **Live Playwright** on the seeded lease: expand a card → 4 pills, **no wrap to a third line**
in the ~320px column; "Plain English" opens the drawer with a jargon-free, citation-bearing prompt;
the relabeled statute pill still opens the walkthrough. Screenshot → `screenshots/`. 4. QA note → `impl.md`.

## Spec-QA — gaps & risks

- **Grounding drift** (highest): "plain English" can tempt the model to soften the law. Mitigated by the
  prompt's explicit *"do not change or soften what the law requires"* + the negative-assertion test +
  the grounding-pin (citation survives into `pendingPrompt`).
- **Row overflow:** 4 pills (+ conditional "View on page") may wrap to 2 lines in the 320px pane;
  `flex-wrap gap-2` handles 2 lines cleanly — verify it never hits a **third** line live.
- **Relabel churn (if D1 = relabel):** only comments/docs reference the word "Explain"; testid + prompt
  unchanged, so tests stay green. Grep before adopting; update the e2e header comment.
- **`GradingDetailBlock` parity:** the clause-detail block has the same pill row but is **out of scope**
  here (the request is the red-flag card). Noted as a possible follow-up for consistency.
- **Future clutter (Rams):** a 5th action would push this row toward needing a "More" menu — flag, don't
  pre-build.

## Out of scope

- A plain-English action in `GradingDetailBlock`/clause rows; a "More actions" menu; changing the
  drawer/assistant behavior; the 44px refactor unless D2 opts in.
- Surface: ~1 helper + ~1 pill + 2 call-site wirings + (D1) a label/icon swap + ~5 tests. No new deps
  beyond the `Languages` lucide glyph.

## Commit style

`feat(s35): "Plain English" red-flag card action …`. Do not commit until the user says so; do not push.
