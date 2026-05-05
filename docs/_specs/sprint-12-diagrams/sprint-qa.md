# Sprint 12 — Sprint Plan QA

**Status:** Self-QA pass per charter §7 step 4.
**Author:** Coding agent (same session as sprint authoring).
**Date:** 2026-05-05.
**Sprint plan under review:** [`sprint.md`](sprint.md).
**Spec under review (already QA-passed):** [`spec.md`](spec.md).

---

## 1. Methodology

The sprint plan was checked against three lenses:

1. **Spec coverage.** Every architectural commitment in the spec
   (§§3a–3g, §4 acceptance scenarios, §5 verification) is mapped
   to a concrete phase, file, and test.
2. **Charter §7 step 3 discipline.** The plan names exact files,
   gives numbered tasks, declares verification commands per phase,
   and exposes a completion checklist. Library APIs named in tasks
   are Context7-verified.
3. **Implementation realism.** TDD red/green/refactor ordering,
   test-count math, regression risk against prior sprints, and
   pre-existing repo state (Windows lint baseline, current 279
   passing tests).

Severity scale (same as spec-QA):

- **S1 — blocking.** Plan cannot proceed to step 5 (implementation)
  until fixed.
- **S2 — substantive.** Should be fixed before implementation; can
  pass conditionally if operator accepts the deferral.
- **S3 — minor.** Wording, completeness, or sequencing; non-blocking.

---

## 2. Issues found

### Issue A — S2 — ToolCard expand/collapse animation missing from Phase 6

**Where.** Spec §3e row 3 promises:

> ToolCard expand/collapse: layout-animated height + fade-in of
> expanded body, 220ms.

Sprint plan Phase 6 ("ToolCard integration") only adds the
`MermaidDiagram` render branch. It does not animate the existing
collapsible body. The spec deliverable is missed.

**Resolution.** Extend Phase 6 with sub-tasks 6.4 / 6.5:

- 6.4 RED: add ToolCard tests asserting (a) the expanded body is
  wrapped in an `AnimatePresence` boundary with a `motion.div` keyed
  on `isExpanded`, and (b) reduced-motion returns to the existing
  abrupt show/hide.
- 6.5 GREEN: wrap the existing `{isExpanded && (...)}` block in
  `<AnimatePresence initial={false}>` with `<motion.div initial={{height: 0, opacity: 0}} animate={{height: 'auto', opacity: 1}} exit={{height: 0, opacity: 0}} transition={{duration: 0.22, ease: 'easeOut'}}>`. Conditional render the
  plain `<div>` form when `useReducedMotion()` is true.

Adds +2 tests. Cumulative test count target rises by 2.

**Status.** Fix applied inline in `sprint.md` — see §6 of this QA.

---

### Issue B — S3 — Phase 0 install commands do not pin major version

**Where.** Phase 0 task 1 says `npm install mermaid`; task 2 says
`npm install motion`. Spec §3a constrains both to `^11.x` and `^12.x`
respectively. If a new major ships between spec authoring and
implementation, `npm install <name>` jumps the major silently.

**Resolution.** Pin major in the install commands:

```
npm install mermaid@^11
npm install motion@^12
```

**Status.** Fix applied inline in `sprint.md`.

---

### Issue C — S2 — Phase 7 motion-attribute test assertion is vague

**Where.** Phase 7 RED test 1: "rendered `<li>` carries Motion-applied
style attributes." This is testable but fragile — Motion writes
varying transform/opacity values across hydration, framerate, and
reduced-motion fallbacks.

**Resolution.** Replace with a deterministic proxy:

- Plain-`<li>` branch carries `data-motion="off"`.
- Motion-`<li>` branch carries `data-motion="on"`.

Both attributes are added by the component. Tests assert the
attribute, not the runtime style. `data-motion` is purely a test
hook; production CSS does not depend on it.

The same pattern is applied to `MermaidDiagram` (Phase 5 tests 5/6)
for consistency: the wrapper renders `data-motion="on"` or
`data-motion="off"`.

**Status.** Fix applied inline in `sprint.md` (Phases 5 and 7
updated).

---

### Issue D — S3 — Test count math drift between §1 table and §14

**Where.** §1 summary says target is "290 ± 2." §14 verification says
"290–304." A summed walk through phase deltas:

```
279 baseline
+ 8 (Phase 2)
+ 2 (Phase 3)
+ 1 (Phase 4)
+ 6 (Phase 5)
+ 3 (Phase 6, MermaidDiagram branch)
+ 2 (Phase 6, expand/collapse animation — Issue A fix)
+ 3 (Phase 7)
+ 1 (Phase 8)
= 305
```

**Resolution.** Lock §1 and §14 to "305 ± 2" with the breakdown
table above. State explicitly that any phase that lands a different
count than planned must update the cumulative target downstream
before proceeding.

**Status.** Fix applied inline in `sprint.md`.

---

### Issue E — S3 — `motion.li` not explicitly Context7-verified

**Where.** Phase 7 uses `<motion.li>`. Context7 verification during
spec/sprint authoring covered `motion.div`, `useReducedMotion`,
`AnimatePresence`, and `motion`'s `layout` prop, but not the
`motion.li` proxy specifically.

**Resolution.** Motion exposes proxies for any HTML/SVG tag (the
docs name `motion.div`, `motion.button`, `motion.span`, `motion.li`,
etc., as a uniform pattern). The risk is theoretically zero. To
honor charter §7 step 3 strictly, add a one-line note in Phase 7
to verify `motion.li` exists at implementation time via a single
Context7 query before writing the component, rather than relying
on this inference.

**Status.** Fix applied inline in `sprint.md` (Phase 7 has a
verification note).

---

### Issue F — S2 — SSR flash mitigation for `motion.li` is reactive, not preventive

**Where.** Sprint-plan §16 risk 3 says: "if a flash appears in phase
9 smoke, switch to `whileInView` or move the motion wrap behind a
mounted-state guard."

**Problem.** This is a fallback. `ChatMessage` is a client component
by transitivity (its parent `ChatUI` is `'use client'`), but Next.js
still server-renders client components for the initial HTML response,
then hydrates. During SSR, `useReducedMotion()` returns `null`, so
the plan's logic `shouldAnimate = !reduced` evaluates `true`, and the
`<motion.li>` initial-state HTML is sent to the browser. Post-hydration,
if the user prefers reduced motion, the component switches to a plain
`<li>` — visual flash. The same can happen for the `initial` prop
running before the user actually sees the message (the message slides
up from below into a position where it was already painted).

A one-line preventive fix is cheaper than a reactive smoke-test.
Use a mounted-state guard: render the plain `<li>` until
`useEffect` confirms client-side mount, then switch to `<motion.li>`.

**Resolution.** Phase 7 component code becomes:

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
const reduced = useReducedMotion();
const shouldAnimate = mounted && !reduced && role === 'assistant';
```

Plain `<li>` renders during SSR and the first client paint. The
motion-li renders only on the second paint, with `initial` correctly
applied. No flash.

The same guard is added to `MermaidDiagram` for symmetry, even
though the diagram is mounted only inside an already-client-side
`ToolCard` (the symmetry simplifies the test pattern).

**Status.** Fix applied inline in `sprint.md` (Phases 5 and 7).

---

### Issue G — S3 — Phase 10 architecture-doc date may collide with prior v1.9 refresh

**Where.** Phase 10 says "Update the `Date:` header to 2026-05-05."

**Problem.** The architecture doc was created in the v1.9 amendment
also dated 2026-05-05. If Sprint 12 implementation lands the same
day as v1.9, the date header is unchanged. If it lands on a later
day, it should advance to that day.

**Resolution.** Reword: "Update the `Date:` header to the
implementation-commit date (the day phase 10 runs)." Implementer
reads the date at commit time.

**Status.** Fix applied inline in `sprint.md`.

---

### Issue H — S3 — Cumulative test count update discipline under-specified

**Where.** §14 says "exact number recorded post-phase-8" but does
not say what happens if a phase lands a count off-target.

**Resolution.** Append: "If any phase lands a test-count delta
different from the §1 table, the implementer must (a) document the
divergence in `impl-qa.md`, (b) update §14's locked count before
running the cumulative verification, and (c) confirm the divergence
does not indicate a missed test in an earlier phase."

**Status.** Fix applied inline in `sprint.md`.

---

### Issue I — S3 — Charter §16 sprint-count text needs explicit update

**Where.** Phase 10 task names the rename of Sprint 12 and the
insertion of Sprint 13, but does not name the prefatory text in
charter §16:

> "ContentOps is delivered in 13 sprints (Sprint 0 through Sprint 12)."

This sentence becomes "in 14 sprints (Sprint 0 through Sprint 13)"
after the v1.12 amendment.

**Resolution.** Append a third bullet under Phase 10's `agent-charter.md`
edits: "Update §16 prefatory sentence: 13 → 14 sprints, Sprint 12 →
Sprint 13."

**Status.** Fix applied inline in `sprint.md`.

---

### Issue J — Confirmation, no fix — Phase 4 prompt does not break existing
system-prompt tests

The existing `system-prompt.test.ts` tests use `expect(prompt).toMatch(...)`
on specific phrases. Appending a new sentence to the `base` array does
not remove any existing phrase, so existing assertions continue to
hold. Verified by inspection of the file in this session.

---

### Issue K — Confirmation, no fix — Phase 6 ToolCard branch does not break existing tests

`ToolCard.test.tsx` asserts behaviors of pending / done / error /
expanded states using `data-testid`-free queries that key on visible
text and class. The new diagram branch renders only when
`invocation.name === 'render_workflow_diagram'`, which existing
fixtures (using `'schedule_content_item'`) do not match. No
regression risk. Verified by inspection.

---

### Issue L — Confirmation, no fix — Phase 7 ChatMessage motion wrap does not
break existing tests

Existing `ChatMessage.test.tsx` queries via `screen.getByRole('listitem')`
and `screen.getByText(...)`. Both work for `<li>` and `<motion.li>`.
No regression risk on the assertion path. Verified by inspection.

---

## 3. Spec coverage matrix

Every spec §3 architectural item maps to a concrete phase. After
applying the Issue A fix, the matrix is complete:

| Spec ref | Subject | Sprint phase |
|---|---|---|
| §3a | `mermaid` ^11 install | Phase 0 |
| §3a | `motion` ^12 install | Phase 0 |
| §3b | Tool descriptor shape | Phase 2 |
| §3b | Output schema (`code`, `diagram_type`, optional `title`/`caption`) | Phase 2 |
| §3c | Prefix + length + comment-skip validation | Phase 2 |
| §3d | `MermaidDiagram` component, `securityLevel: 'strict'`, dynamic import, `useId` | Phase 5 |
| §3d | Reduced-motion conditional render | Phase 5 (with Issue F fix) |
| §3d | Parse-error fallback to `<pre>` | Phase 5 |
| §3e row 1 | Diagram first-paint fade+scale | Phase 5 |
| §3e row 2 | `ChatMessage` entry slide+fade | Phase 7 (with Issue F fix) |
| §3e row 3 | `ToolCard` expand/collapse layout animation | Phase 6 (with Issue A fix) |
| §3f | System-prompt diagram-tool paragraph | Phase 4 |
| §3g all rows | File creation/modification | Phases 0–8 |
| §4 scenarios 1–9 | Acceptance | Phase 9 manual |
| §5 verification commands | Standard + sprint-specific | Phases 2/3/5/6/7/8 + §14 |

---

## 4. Spec-QA-deferred items confirmation

Three items deferred by spec-QA; all carried correctly:

1. **Charter §16 amendment intent.** Confirmed approved by operator
   in spec-QA reply ("Looks good, lets proceed"). Plan Phase 10
   names the amendment.
2. **Optional integration test.** Default = include. Plan Phase 8
   includes it.
3. **No code changes outside the spec scope.** Plan §17 makes the
   prohibition explicit.

---

## 5. Charter §12 writing-style check on the sprint plan

- No "robust," "seamless," "leverage," "elegant."
- No filler ("this sprint aims to," "let us now consider").
- Numbered phases and tables for comparable data.
- Code blocks for code, prose for reasoning.
- Tight section bodies — no padding.

**Status.** Style check passes.

---

## 6. Resolutions applied to sprint.md

The following edits were applied in this same session.

| # | Issue | Edit |
|---|---|---|
| A | ToolCard expand/collapse animation missing | Phase 6 expanded with 6.4 RED + 6.5 GREEN sub-tasks; +2 tests added to count target. |
| B | Install commands unpinned | Phase 0 commands updated to `mermaid@^11` and `motion@^12`. |
| C | Vague motion-attribute test assertion | Phases 5 and 7 updated to use `data-motion="on"`/`"off"` test-hook attributes; component code emits these. |
| D | Test count drift | §1 and §14 locked to 305 ± 2 with breakdown table. |
| E | `motion.li` not Context7-verified | Phase 7 has a one-line verification note for the implementer. |
| F | SSR flash reactive, not preventive | Phases 5 and 7 component code includes a mounted-state guard (`useEffect(() => setMounted(true), [])`). |
| G | Architecture-doc date | Phase 10 reworded to "implementation-commit date." |
| H | Test-count discipline under-specified | §14 appended with the divergence-handling rule. |
| I | Charter §16 sprint-count text | Phase 10 includes the prefatory-sentence update. |
| J, K, L | Existing-test regression risk | Confirmed clean; no edit. |

---

## 7. Conclusion

**Issues found:** 12.
**S1 (blocking):** 0.
**S2 (substantive):** 3 — issues A, C, F. All fixed inline.
**S3 (minor):** 6 — all fixed inline.
**Confirmations (no fix):** 3 — issues J, K, L.

The sprint plan is **approved for step 5 (implementation)** subject
to one operator confirmation:

- **Test-count window.** Lock target is 305 ± 2 (was 290 ± 2 in
  the pre-QA plan). The widened band reflects the ToolCard animation
  tests added by Issue A and the data-motion proxy tests added by
  Issue C. If the operator wants a tighter band, name it.

No documentation outside the QA artifact and the sprint edits is
changed in this turn. The charter §16 amendment, the architecture-doc
refresh, and any other doc updates land in the implementation commit
per the charter's "documentation in the same commit as the code"
rule and per Phase 10 of the sprint plan.

**End of sprint plan QA.**
