# Sprint 12 — Spec QA

**Status:** Self-QA pass per charter §7 step 2.
**Author:** Coding agent (same session as spec authoring).
**Date:** 2026-05-05.
**Spec under review:** [`docs/_specs/sprint-12-diagrams/spec.md`](spec.md), drafted 2026-05-05.

---

## 1. Methodology

The spec was checked against:

- Charter v1.11 §§1–16, with particular attention to §4 (architectural
  invariant), §5 (hard requirements), §6 (design philosophy ranking and
  simplicity meta-rule), §7 (delivery loop step boundaries), §11a
  (out-of-scope patterns), §11b (demo-mode guardrails), §12 (writing
  style), §15 (MCP tool usage), and §16 (sprint roadmap).
- Internal spec consistency — every cross-reference between sections,
  every numbered acceptance criterion against the architecture it
  asserts, every claim in §11 cross-subsystem reasoning against the
  primary §3 architecture.
- Prior sprint contracts — Sprint 7 tool registry shape, Sprint 8
  mutating-tool path (verified the diagram tool correctly opts out),
  Sprint 11 `workspace_id` requirement on `ToolExecutionContext`.
- Code paths the spec relies on — `mcp/contentops-server.ts` calling
  `createToolRegistry(db)` (confirmed), `src/lib/chat/system-prompt.ts`
  exporting `buildSystemPrompt` (confirmed), `ToolCard` reading
  `invocation.name` (confirmed by the spec author's prior reading).
- Library claims verified during spec authoring against Context7
  (`/mermaid-js/mermaid/v11_0_0` and `/websites/motion_dev`).

Sequential Thinking MCP was not loaded in this session; the spec
already disclosed this and reasoned through cross-subsystem invariants
manually. The QA pass extends that reasoning rather than restarting
it.

Severity scale used below:

- **S1 — blocking.** The spec cannot proceed to step 3 until fixed.
- **S2 — substantive.** Should be fixed before implementation; can
  pass spec-QA conditionally if the operator accepts the deferral.
- **S3 — minor.** Wording, clarity, completeness; non-blocking.

---

## 2. Issues found

### Issue 1 — S2 — Misleading security claim in input schema description

**Where.** §3b, the `code` property's `description` string ends with
"HTML-label syntax is rejected."

**Problem.** The validator in §3c only checks the diagram-keyword
prefix and length. It does not detect or reject HTML-label syntax
(e.g., `A["<b>label</b>"]`). The actual defenses are
`htmlLabels: false` and `securityLevel: 'strict'` on the renderer
(§3d). The schema description over-claims, which mis-sets reviewer
expectations and could leak into the LLM's interpretation of the
contract since input-schema descriptions are prompt-visible.

**Resolution.** Drop the over-claim from the description. The
defense-in-depth lives where it belongs (the renderer init) and the
spec's threat-model section (§2 invariant 5) already names it.

**Status.** Fixed inline in spec — see §6 of this QA.

---

### Issue 2 — S3 — Reduced-motion implementation under-specified

**Where.** §3d describes a `motion.div` wrapper with `initial`,
`animate`, and `transition` props. §11 cross-subsystem reasoning
prescribes "conditional render of `motion.div` vs. plain `div`" when
`useReducedMotion()` returns true. The two sections are consistent
but §3d alone does not communicate the conditional pattern, and an
implementer reading only §3d could write `transition={{ duration: 0 }}`
which still triggers a frame.

**Resolution.** Make the reduced-motion conditional explicit in §3d.
State both the normal render path and the reduced-motion render path
side by side. Same change in §3e for the other two motion surfaces.

**Status.** Fixed inline in spec — see §6 of this QA.

---

### Issue 3 — S2 — Acceptance criterion asserts model behavior, not code behavior

**Where.** §4 acceptance criterion 3: "The model calls `search_corpus`
first (visible as a separate `ToolCard`), then
`render_workflow_diagram`."

**Problem.** Tool-call ordering is a model decision shaped by the
system prompt, not a code-enforceable invariant. A reviewer running
the criterion against a particular model snapshot may see the model
skip `search_corpus`, call them in parallel, or call them in reverse
order — and the criterion would fail through no implementation defect.
Acceptance criteria must be code-assertable or manual-smoke-asserted
with appropriate hedging.

**Resolution.** Split the criterion into two:
- **Asserted in `system-prompt.test.ts`:** the diagram-tool instruction
  paragraph in the system prompt directs the model to call
  `search_corpus` first when the diagram describes brand content.
- **Asserted in manual smoke (recorded in `impl-qa.md`):** the typical
  flow on a freshly-uploaded brand workspace shows `search_corpus`
  preceding `render_workflow_diagram` for the seeded prompt set.
  Failure of this in any one trial is not a sprint-blocking defect
  unless it reproduces deterministically on Claude Haiku 4.5.

**Status.** Fixed inline in spec — see §6 of this QA.

---

### Issue 4 — S3 — Sprint 12 spec overcommits Sprint 13's scope

**Where.** §6, "The Loom for Sprint 13's deployment closeout **must**
include one diagram moment in the recorded walkthrough."

**Problem.** Spec 12 cannot dictate Sprint 13's spec content. The
operator authorized the sprint reorder on the premise that diagrams
would feature in the Loom, but binding that into Sprint 12's spec is
a context-hierarchy violation in reverse — Sprint 13's spec outranks
this one once authored.

**Resolution.** Soften from "must" to "recommended for Sprint 13 spec
authoring; the operator's stated rationale for the sprint reorder
hinges on this." The Sprint 13 spec author can decide what the Loom
covers.

**Status.** Fixed inline in spec — see §6 of this QA.

---

### Issue 5 — S3 — Unsubstantiated bundle-size figure

**Where.** §8 risk 1: "Mermaid 11 minified is ~2.8 MB before
tree-shaking."

**Problem.** The figure is unverified. Mermaid's actual minified +
gzipped size depends on which subset of diagram families ship and
the bundler's tree-shaking effectiveness; a stale or invented number
in the risk register is exactly the kind of confident-sounding spec
claim charter §15 warns about.

**Resolution.** Replace with a measurement requirement: "Mermaid 11
is non-trivial in bundle size; the sprint plan must measure the
exact build-output delta on a clean Vercel build, document the
number in `sprint.md`, and confirm the lighthouse score does not
regress below the Sprint 11 baseline."

**Status.** Fixed inline in spec — see §6 of this QA.

---

### Issue 6 — S3 — Terminology drift between `Creator+` and `roles: 'ALL'`

**Where.** §2 invariant 2 says "Diagram rendering is `Creator+`."
§3b descriptor block says `roles: 'ALL'`. Both mean the same thing
in the current 3-role hierarchy, but mixing terminology in one spec
risks the implementer encoding one and reviewing against the other.

**Resolution.** Pick one canonical phrase. Use `roles: 'ALL'` (it
matches the type definition in `domain.ts` and is what the test
will assert), and explain in surrounding prose: "`'ALL'` means
Creator + Editor + Admin — the full role hierarchy."

**Status.** Fixed inline in spec — see §6 of this QA.

---

### Issue 7 — S3 — Rejection rationale could be tighter

**Where.** §7 row "Diagram editing UI": "Not in the brand-onboarding
workflow."

**Problem.** The rationale is loose. Many things "not in the workflow"
might still be useful. The actual reason is product-shape: ContentOps
is a chat-driven cockpit, not an authoring environment.

**Resolution.** Reword to: "ContentOps is a chat-driven cockpit, not
an authoring environment. Operators iterate diagrams by asking the
model to revise. A direct-edit affordance would invert the product's
mental model."

**Status.** Fixed inline in spec — see §6 of this QA.

---

### Issue 8 — S2 — Charter §16 conflict surfaced; precondition needs explicit acknowledgment

**Where.** §10 of the spec flags that charter §16 still names Sprint
12 as "Demo Deployment + README + Loom" and that an amendment to v1.12
must land in the implementation commit.

**Problem.** This is a §8 charter-conflict by the letter of charter
§9 (stop-the-line rules). The spec correctly surfaces it rather than
silently resolving. But the spec-QA must record explicitly that the
amendment is a precondition to step 3 (sprint plan authoring),
because the sprint plan would otherwise contradict the active charter.

**Resolution.** No spec change required — the spec is correct. The QA
records: **operator must approve the v1.11 → v1.12 amendment intent
before step 3 (sprint plan) is authored.** The charter file itself
is not edited in this turn (per the charter rule that documentation
lands with the code, and per §7 step boundaries that no step N+1 is
started before step N is approved).

**Status.** Acknowledged here. Operator approval required before step 3.

---

### Issue 9 — S3 — File layout omits a likely integration test

**Where.** §3g file layout lists unit tests for the new tool, the
renderer component, the `ToolCard` branch, the `ChatMessage` motion
wrap, and the system-prompt assertion.

**Problem.** It does not include an integration test for the chat
route — confirming that a `tool_use` event for `render_workflow_diagram`
flows through the NDJSON stream, that the `tool_result` event lands in
`ChatMessage.toolInvocations` with the expected shape, and that the
`MermaidDiagram` component receives the validated `code`. Sprint 7
established this integration pattern; Sprint 12's diagram tool
deserves the same coverage if the sprint plan has the budget.

**Resolution.** Add an optional file to §3g: `src/app/api/chat/diagram-tool.integration.test.ts`
(or extend an existing chat-route integration test). Mark it as
"sprint-plan decides" so it is not a hard requirement at spec time.

**Status.** Fixed inline in spec — see §6 of this QA.

---

### Issue 10 — S3 — Comment-skip rule for prefix validation under-specified

**Where.** §3c describes the validator as "Trim leading whitespace;
the first non-empty, non-`%%`-comment line must start with one of
the eight diagram keywords."

**Problem.** The exact rule is ambiguous. Mermaid supports
`%%{init: ...}%%` directives and `%% line comment` lines that may
appear before the diagram keyword. The implementer must know whether
the validator skips both forms, only the line-comment form, or only
the directive form. Without specification this becomes a Sprint
12 mid-implementation question.

**Resolution.** Tighten §3c: "Strip leading whitespace, then iteratively
strip leading lines that match either `^%%\\{[\\s\\S]*?\\}%%\\s*$`
(init directive) or `^%%[^\\n]*$` (line comment) until reaching a
non-comment line. That line must start with one of the eight diagram
keywords." This makes the rule implementable from the spec alone.

**Status.** Fixed inline in spec — see §6 of this QA.

---

### Issue 11 — S3 — Confirm §11a out-of-scope patterns are not violated

**Where.** Charter §11a lists patterns that cannot be added without
explicit operator approval (background workers, multi-provider
routing, multiple auth, blog pipeline, full design system, i18n,
workflow engines, feature flag systems, observability stacks,
containerization beyond a single Docker, email verification, file
upload on the deployed demo).

**Problem.** None — verified by inspection.

| Pattern | Sprint 12 introduces? | Notes |
|---|---|---|
| Deferred job queues / web push / background workers | No | Diagram rendering is synchronous, client-side. |
| Multi-provider model routing | No | Anthropic only, unchanged. |
| Multiple auth methods | No | RBAC unchanged. |
| Blog pipeline, marketing site | No | N/A. |
| Full design system | No | Motion is an animation library, not a design system. Tailwind 4 component conventions unchanged. |
| i18n / localization | No | N/A. |
| Workflow engines | No | N/A. |
| Feature flag systems | No | The diagram tool is unconditionally enabled per its registry registration. No `config/tools.json` flag. |
| Observability stacks | No | N/A. |
| Containerization beyond single Docker | No | N/A. |
| Email verification / OAuth / SSO | No | N/A. |
| File upload on deployed demo | No | Diagrams are model-emitted, not user-uploaded. |

**Status.** Confirmed clean. No spec change.

---

## 3. Cross-sprint contract checks

Verified that Sprint 12 does not break any prior sprint's load-bearing
contract.

| Prior sprint | Contract | Sprint 12 alignment |
|---|---|---|
| Sprint 7 — tool registry | All tools registered via `createToolRegistry` and exposed identically over MCP and the chat route (charter §4 invariant). | Diagram tool registered in `create-registry.ts`; `mcp/contentops-server.ts` already calls that factory, so MCP exposure is automatic. ✓ |
| Sprint 8 — mutating tools + audit + rollback | Mutating tools have `compensatingAction`; read-only tools do not. Registry routes mutating tools through a sync transaction with audit-row insert. | Diagram tool has no `compensatingAction`. The registry's mutating-tool path is not exercised. No audit row. ✓ |
| Sprint 9 — operator cockpit | Recent Actions feed shows audit-log rows. | Diagram renders are not audited; they do not appear in the cockpit feed. Acceptance criterion 8 asserts this. ✓ |
| Sprint 10 — UI polish | Aesthetic correctness is human-eyeball review; behavior is TDD. | Sprint 12 follows the same split: motion behavior (reduced-motion branch, layout transition) is testable; visual smoothness is manual-smoke. ✓ |
| Sprint 11 — workspaces & brand onboarding | Every tool execution carries `workspace_id` in `ToolExecutionContext`; per-data tables filter on `workspace_id`. | Diagram tool ignores `workspace_id` (workspace-agnostic; it just renders code). The system prompt is what couples diagram content to the active brand via `search_corpus`. No new `workspace_id` filtering needed. ✓ |

---

## 4. Charter §12 writing-style check

Re-read the spec for filler, marketing language, and hedging:

- "Polish" appears 6 times, mostly in section titles and the §3e
  motion-surface table. The operator's chosen sprint title contains
  "Motion Polish," so the term is load-bearing here. Acceptable.
- No instances of "robust," "seamless," "cutting-edge," "elegant,"
  or "leverage."
- Hedging: §6 uses "should consider" after the fix from Issue 4 —
  appropriate, since the recommendation is to a future sprint.
- §1 and §6 contain narrative prose that motivates the sprint. This
  is permitted by §12 ("Prose for reasoning"). Each prose paragraph
  is short and directly justifies a downstream decision.

**Status.** Style check passes.

---

## 5. Open questions for the operator

Two questions surface from the QA that the spec cannot resolve:

1. **Charter amendment intent.** Per Issue 8: do you confirm that
   charter §16 should be amended to v1.12 (renaming Sprint 12 to
   "Diagram Tool + Motion Polish" and inserting Sprint 13 as
   "Demo Deployment + README + Loom") in the same commit that lands
   the Sprint 12 implementation? If yes, step 3 (sprint plan) can
   proceed under that assumption. If no, step 3 stops on the
   charter conflict.

2. **Optional integration test.** Per Issue 9: do you want the
   sprint plan to include a chat-route integration test that
   exercises the diagram tool's NDJSON stream end-to-end, or is the
   unit-test coverage in §3g sufficient? Default if unanswered:
   sprint plan will include it (extra ~30 minutes, matches Sprint 7
   convention).

---

## 6. Resolutions applied to spec.md

The following edits were applied to the spec in this same session.
Each edit corresponds to a numbered issue above.

| # | Issue | Edit |
|---|---|---|
| 1 | Misleading "HTML-label syntax is rejected" | §3b `code` description rewritten to drop the over-claim; security model anchored in §2 invariant 5 + §3d renderer init. |
| 2 | Reduced-motion under-specified | §3d and §3e expanded with explicit "render `<div>` when `useReducedMotion()` is true; render `<motion.div>` otherwise." Acceptance criterion 6 unchanged. |
| 3 | Model-behavior acceptance criterion | §4 criterion 3 split into a system-prompt-test assertion and a manual-smoke note with explicit hedging. |
| 4 | Sprint 12 binding Sprint 13 | §6 softened from "must" to "recommended for Sprint 13 spec authoring." |
| 5 | Bundle-size figure | §8 risk 1 rewritten as a measurement requirement, no figure cited. |
| 6 | Terminology drift | §2 invariant 2 rewritten in `roles: 'ALL'` form with the role expansion explained inline. |
| 7 | Loose rejection rationale | §7 "Diagram editing UI" rewritten to name the product-shape reason. |
| 8 | Charter conflict acknowledgment | No spec edit; operator approval required (see §5 of this QA). |
| 9 | Optional integration test | §3g extended with a sprint-plan-decides line item. |
| 10 | Comment-skip rule | §3c tightened with the explicit regex set. |
| 11 | §11a confirmation | No spec edit; documented as confirmed clean above. |

---

## 7. Conclusion

**Issues found:** 11.
**S1 (blocking):** 0.
**S2 (substantive):** 3 — issues 1, 3, 8. Issues 1 and 3 fixed inline.
Issue 8 requires operator approval (charter amendment intent).
**S3 (minor):** 8 — all fixed inline or confirmed clean.

The spec is **conditionally approved** pending operator confirmation
of the charter §16 amendment intent (open question 1 in §5 above).
With that confirmation, step 3 — sprint plan authoring at
`docs/_specs/sprint-12-diagrams/sprint.md` — can proceed.

No documentation outside the QA artifact and the spec edits is changed
in this turn. The charter §16 amendment, the architecture-doc bump,
and any other docs land in the implementation commit per the
charter's "documentation in the same commit as the code" rule.

**End of spec QA.**
