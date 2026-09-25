# Agent Reliability: Verification Gates, Grounding Rules, and Failure Modes

## Purpose

`development-philosophy.md` describes the workflow: **Spec → Sprint → Tests → Code → QA → Repeat**.
`power-words.md` provides the shared vocabulary for *why* decisions are made.

This document is the enforcement layer between them. It exists because of one observed fact:
**advice does not survive contact with a long agent trajectory; mechanisms do.**

Every "should" in the philosophy docs becomes one of three things here:

- a **gate** — the work does not proceed until it passes;
- a **checklist** — a reviewer verifies each item; or
- an **artifact** — proof is produced (a log, a citation, a commit), not a claim.

If a rule cannot be expressed as a gate, checklist, or artifact, it does not belong in this document.

## The Five Gates

Ordered by strength of supporting evidence (see "Evidence notes" at the end).

### Gate 1 — Human-written acceptance tests first

The sprint's acceptance criteria are written as executable tests **before** implementation,
and the tests are committed **before** the implementation commit. Red → Green → Refactor,
with the commit order as the mechanical enforcement: a reviewer can see in `git log`
that the tests predate the code that passes them.

- Tests are executable test code, not prose descriptions of tests.
- The human (Jesus) writes or approves the acceptance tests. AI-generated tests are
  unreliable oracles: studies show LLMs write tests that reflect what code *does*,
  not what it *should do*. The agent may draft tests; the human owns them.
- After implementation, the loop is test → fail → fix → pass, feeding actual failure
  output back in. Never "tests pass" as a sentence — the gate-sweep log is the artifact.

Good invocation:

> This is a Kent C. Dodds / TDD issue: the acceptance tests for the purge path must land
> in an earlier commit than the migration code → I am writing the TTL-expiry test first,
> watching it fail, then implementing.

### Gate 2 — An independent critic reviews every change

The builder never grades its own work. Every sprint's diff gets a review pass from an
agent (or the human) that **did not see the build instructions** — only the spec and the diff.
Evaluation is a different cognitive task than generation; the same model catches flaws
when asked to look critically, and a separate context cannot rationalize the builder's shortcuts.

The critic's brief is fixed:

1. List every behavior in the diff the spec does not sanction (scope creep).
2. List every spec requirement missing from the diff (gaps).
3. Attempt the named failure modes below: is this sycophantic agreement, validation
   theater, or confabulation about repo state?
4. Verdict per requirement: IMPLEMENTED, PARTIAL, ABSENT, DIVERGENT, or UNVERIFIABLE —
   each backed by file:line evidence.

Good invocation:

> This is a builder-critic separation issue because the migration author also wrote the
> review summary → the critic pass must run in a fresh context with only the spec and the diff.

### Gate 3 — file:line evidence grounding and re-run verification

No factual claim about the codebase without a citation. Every claim in a PR description,
review summary, or handoff cites **file + line** (or a quoted snippet). Claims the agent
cannot cite are marked `[UNVERIFIED]` or dropped — never smoothed over.

- **Read-before-write:** before modifying a file, quote the section being changed.
- **Re-run, don't recall:** verification means executing the tool again — `grep`, the test
  run, the build — with a fresh timestamp. "The tests passed earlier" is not verification.
- **Evidence labels on validation claims:** `[VERIFIED-REAL]` (ran against real repo state,
  cited) vs `[SYNTHETIC]` (valid for unit-test fixtures only, invalid as proof the
  change works) vs `[INFERRED]`. A success rate, a passing suite, a migration result —
  these MUST carry `[VERIFIED-REAL]` or they are validation theater.
- **Ban extrapolation:** for repo-specific facts (does this file exist? what does this
  config contain?), parametric memory is forbidden. Unknown → "not found", then go read it.

Good invocation:

> This is a source-grounding issue because the summary claims the TTL purge runs on
> expiry but cites no code → re-read `src/lib/db/`, cite the purge path at file:line,
> or mark the claim `[UNVERIFIED]`.

### Gate 4 — Pre-merge verification checklist

At the pre-merge pause point, the reviewer walks a short checklist of killer items —
the easy-to-forget critical steps, not the intellectually hard parts. Checklists exist
for experts because failure is ineptitude (skipped steps under pressure), not ignorance.

The LeaseLens pre-merge checklist (revise it from actual failure history; 5–9 items,
never an exhaustive procedure):

- [ ] Gate sweep green with the log pasted: `npm run lint && npm run typecheck && npm test && npm run build`
- [ ] Spec conformance: every sprint requirement maps to file:line; no unsanctioned behavior in the diff
- [ ] Acceptance tests predate implementation in commit order; acceptance tests are human-owned
- [ ] Data-retention invariants re-verified for any storage change (24h TTL, purge-on-resolve, delete-now)
- [ ] Fail-closed auth re-verified for any auth-adjacent change (`requireSessionOrAnon`, guardrails)
- [ ] No secrets, credentials, or raw PII in the diff; new config is env-driven
- [ ] Docs updated where behavior changed (`architecture.md` claims re-verified per the Cunningham rule)
- [ ] Independent critic pass completed by an agent that did not see the build instructions

A caught bug becomes a candidate checklist item. The checklist is grown from scar tissue,
not written once and frozen.

### Gate 5 — The spec is the source of truth; conformance is audited

When spec and code diverge, the spec wins until it is deliberately amended — drift is a
bug, not debt. Each sprint closes with a two-direction conformance sweep:

- **Forward:** every requirement ID → code, with file:line evidence at a pinned SHA.
- **Backward:** every behavior in the diff → the requirement that sanctions it.
  Unsanctioned behavior is either removed or the spec is amended with a recorded decision.

Requirement IDs are stable (`FR-*`, `NFR-*`, `AC-*`); acceptance criteria are
machine-checkable (a test passes, a file exists, an endpoint responds) — never
"the UI feels clean". The traceability lives in the sprint's spec artifacts under
`docs/_specs/`; discrepancies are filed as issues.

## Named Failure Modes

The power-words framework names heroes. These are the villains — the specific ways
AI-assisted work fails on this project, each with its mitigation. They are invoked
with the same grammar: `<Name>: <concrete lesson> → <decision made here>`.

### Sycophancy

The agent agrees with flawed instructions instead of pushing back. Models flip
initially correct answers under user pushback at high rates, and RLHF amplifies
agreeableness — so the agent's agreement is never confirmation.

- **Mitigation:** the workflow must *invite* pushback ("challenge my plan before
  implementing"); the critic (Gate 2) is explicitly tasked with disagreeing; a spec
  the agent never questioned is a smell, not a success.
- **Project anchor:** spec QA step, sprint reviews.

Good invocation:

> This is a sycophancy risk because the agent accepted the migration plan without
> questioning the transaction semantics → require the critic to argue against the plan
> before implementation starts.

### Confabulation

The agent states repo facts it never verified: invented files, APIs, config values,
test results. It optimizes for apparent success and misreports actual state.

- **Mitigation:** Gate 3 (file:line citations, re-run verification, ban on
  extrapolation). Machine-readable logs of actions beat narrative summaries.
- **Project anchor:** PR descriptions, review summaries, handoffs between agents.

Good invocation:

> This is a confabulation risk because the handoff describes files no tool output ever
> showed → every filename in the summary needs a `read` or `grep` behind it, cited.

### Reward Hacking / Validation Theater

The agent games its own success criteria: rewriting a failing test to force "Pass",
running validators against synthetic data it generated itself and reporting "100% SUCCESS",
polishing a report disconnected from the actual experiment outcome. The agent must
never be the sole author of both the implementation and its acceptance test.

- **Mitigation:** Gate 1 (human-owned tests), Gate 2 (independent critic), Gate 3
  (`[VERIFIED-REAL]` labels). Treat every agent-produced report as a *claim* until
  re-executed.
- **Project anchor:** evals, test suites, migration verification, any "all green" summary.

Good invocation:

> This is a reward-hacking risk because the agent wrote both the migration and the
> test that declares it correct → the acceptance test must be human-owned and the
> critic must re-run it independently.

## Supporting Practices

These are not gates, but they make the gates cheaper to run.

- **Pre-mortem on every spec, before coding.** "If this sprint fails in production,
  what are the three most likely causes?" Write them into the spec as risks with
  mitigations. (The historic guardrails inversion — the check read the wrong flag —
  is exactly the class of failure a pre-mortem surfaces.)
- **Short sessions, small diffs.** Understanding degrades as history grows and gets
  compacted. Break large features into small sprints with fresh sessions; load only
  task-relevant files. A sprint should be reviewable in one sitting — if the diff
  spans unrelated areas, split it.
- **Review against conventions, not just correctness.** The critic checks the right
  tables, utilities, folder structure, and doc updates — not only "does it work".
- **No autonomous merges, ever.** The agent may prepare the PR; a human merges.
  Client-side hooks are cosmetic to an agent — enforcement that matters is human
  sign-off.
- **Decisions log.** Every deliberate deviation from the spec is recorded with
  rationale (in the sprint artifacts or `history.md`). Drift becomes visible and
  deliberate instead of silent.

## Evidence Notes

This document's own standard (the power-words contract: no false authority) applies
to the research behind it. Graded honestly:

- **Quantitative, coding-domain:** tests-as-input improve LLM code correctness
  +9–30% (TGen, GPT-4, arXiv:2402.13521), +23–45% across studies; remediation loops
  add +5–9%; self-critique loops +11–22% (Reflexion) / ~20% (Self-Refine).
  METR's RCT: unstructured AI assistance made experienced developers 19% *slower*
  — structure is what converts AI into leverage.
- **Quantitative, adjacent-domain:** the WHO Surgical Safety Checklist program
  (multi-hospital) is the empirical anchor for checklist efficacy among experts;
  transfer to code review is principled but analogical.
- **Vendor-reported, directional:** Anthropic's multi-agent research system
  (+90.2% on an internal eval, June 2025) — one vendor source, treat ratios as
  directional, not precise.
- **Practitioner-reported:** spec-driven conformance sweeps, instruction files
  (AGENTS.md), short sessions, PRs on solo projects.
- **Analogical:** Evans' ubiquitous-language practices are established for human
  teams; no study was found testing them specifically for AI-agent code quality.

Where this document asserts a number, the grade travels with it. Where it asserts a
practice on analogical grounds, it says so.

## Relationship To Other Foundation Docs

- `development-philosophy.md` — the workflow this document enforces
  (Spec → Sprint → Tests → Code → QA → Repeat).
- `power-words.md` — the vocabulary; this document adds the three failure-mode
  entries' enforcement side and shares the invocation grammar.
- `architecture.md` — the invariants the checklists protect (retention, fail-closed
  auth, state ownership, grounding).
- `data-retention.md` — the retention statements Gate 4 re-verifies on storage changes.
