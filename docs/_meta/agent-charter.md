# Agent Charter — ContentOps

**Version:** 1.3
**Status:** Active
**Governs:** All AI coding agent sessions for the ContentOps project
**Precedence:** This charter outranks any single sprint doc, spec, or
conversational instruction, except where a later amendment to the charter
itself supersedes an earlier rule.

---

## 1. Read This First, Every Session

You are a coding agent working on ContentOps. Before doing anything in a new
session, you must:

1. Read this charter in full.
2. Read `docs/_references/README.md`.
3. Read the spec file for the current sprint (e.g., `docs/_specs/sprint-0-foundation/spec.md`).
4. Read the sprint doc for the current sprint, if one exists yet.
5. Confirm in your first response which sprint you are operating in and what
   your current task is, grounded in those four files, before touching any
   code.

Before writing code that uses a framework or library API, use the Context7
MCP tool to verify the API exists and behaves as expected in the version
declared in `package.json`. Do not rely on training-data memory for library
syntax — especially for Next.js 16 App Router, React 19, Tailwind CSS 4, and
the Anthropic SDK, all of which have recent breaking changes. Section 15
governs MCP tool usage in detail.

If any of those files is missing, stop and ask. Do not fabricate a plan in
their absence.

---

## 2. What ContentOps Is

ContentOps is a locally-runnable, publicly-demoable AI operator cockpit for
onboarding a media brand into an AI-assisted content operations workflow. The
product persona is a small content team (Creators, Editors, Admins) taking a
new brand — for the demo, a fake brand called **Side Quest Syndicate** — from
"pile of intake documents" to "first-week content calendar approved and
scheduled."

The cockpit runs end-to-end on a reviewer's laptop with a cloned repo and an
Anthropic API key. A public demo instance (Vercel) lets anonymous reviewers
click through the full workflow without installing anything, using pre-seeded
Side Quest Syndicate data and cost-guarded interactions.

The user interacts with ContentOps through a chat homepage backed by
retrieval-augmented generation over the brand's onboarding materials, and
through an operator cockpit dashboard that shows live state, recent tool
actions, approvals, rollback history, and system health.

The model answers grounded questions about the brand, drafts content, creates
checklist items, requests approvals, and — with appropriate role — executes
mutating actions (scheduling a calendar item, approving a draft) through MCP
tools. Every mutating action is logged with a compensating action so it can be
rolled back.

ContentOps is not:

- a caption generator
- a generic document chatbot
- a clone of Studio Ordo
- a multi-tenant SaaS product
- a place to demonstrate every pattern the agent has ever seen

It is a bounded, role-aware, auditable, rollback-capable cockpit for one
specific workflow: **brand onboarding**.

---

## 3. Audience For The Output

The intended reviewer of this project is a hiring manager for one of the
following role types:

- Forward Deployed Engineer (Revin, Actively AI, Distyl, Adaptive ML, Thread AI)
- AI Product Engineer (Doing Things, similar product-minded AI roles)
- Applied AI Engineer (Thread AI and similar)

The project is being built to demonstrate, in order of priority:

1. That the author can ship a TypeScript + Next.js application end-to-end
2. That the author can compose LLMs, RAG, and tools into a coherent system
   rather than calling APIs in isolation
3. That the author can build and operate evaluation frameworks for AI systems
4. That the author can work inside engineering constraints (specs, RBAC,
   audit, rollback) rather than around them

Every implementation decision should be legible to that reviewer. Cleverness
that obscures the demonstration of those four skills is a regression, not an
improvement.

---

## 4. The Architectural Invariant

ContentOps has one architectural invariant that must hold across every sprint:

> **The model's prompt-visible tool schemas and its runtime-executable tools
> must come from the same registry, filtered by the same RBAC, so that
> prompt claims and runtime behavior cannot drift apart.**

If a sprint's implementation could cause the prompt to claim a tool the user's
role cannot execute, or could cause a tool to execute that was not advertised
in the prompt, that sprint has failed regardless of which tests pass.

This invariant is borrowed from Studio Ordo's architecture and is the single
most important design decision in the project.

---

## 5. Hard Requirements

ContentOps must satisfy all of the following. These are non-negotiable across
every sprint.

1. **Homepage chat.** A beautiful, polished chat UI at `/` is the primary
   product surface. Streaming responses. Real message history.
2. **Operator cockpit dashboard.** A dedicated cockpit surface (either a
   right-side panel on the homepage or a `/cockpit` route) showing live
   state, recent tool actions, pending approvals, rollback history, and eval
   health.
3. **MCP tools.** At least one custom MCP server written by the author,
   exposing ContentOps capabilities over the Model Context Protocol.
   Consumed MCP servers are additive but not a substitute.
4. **RAG system.** Hybrid retrieval (vector + BM25 + reciprocal rank fusion)
   over an ingested corpus of brand onboarding materials.
5. **SQLite storage.** All persistent state (users, sessions, conversations,
   messages, documents, chunks, audit log, rollback snapshots, approvals)
   lives in SQLite via `better-sqlite3`. No Postgres, no external DB.
6. **Role-based access control.** Three roles — Creator, Editor, Admin —
   with middleware-enforced authorization on every protected surface
   (routes, API endpoints, tool calls).
7. **Rollback controls.** Every mutating tool call produces a
   `compensating_action` payload. The cockpit surfaces an Undo affordance.
   Admins see the full audit log; non-admins see their own actions.
8. **Spec-driven development workflow.** Every sprint produces a spec, a
   sprint doc, an implementation, and a QA report, in that order. Each
   artifact is checked into `docs/_specs/`.
9. **Automated testing.** Unit tests, integration tests, and an AI eval
   harness. Roughly 40 tests total — every test load-bearing, none written
   for count.
10. **Local-runnable, remotely demoable.** ContentOps must run end-to-end on
    a reviewer's laptop with only a cloned repo, a free SQLite file, and an
    Anthropic API key. No Postgres, no external auth, no third-party
    telemetry, no cloud services beyond the Anthropic API itself.
11. **Live demo deployment with cost guardrails.** ContentOps must deploy to
    a public URL (Vercel recommended) where an anonymous visitor can land,
    switch roles via a visible role-overlay control, and exercise the full
    cockpit — chat, RAG retrieval, MCP tool call, approval, rollback — on
    pre-seeded Side Quest Syndicate data, without creating an account. The
    deployed instance must enforce cost guardrails (see Section 11) so that
    public traffic cannot run up an unbounded Anthropic bill. The demo
    deploys with a read-only seeded corpus; document upload is available to
    local-run reviewers only.
12. **Seed-only corpus on the demo.** The Side Quest Syndicate corpus is
    generated at build or first-boot time. Anonymous visitors cannot upload,
    modify, or delete corpus documents on the deployed instance. Local
    development allows corpus manipulation through admin-role tooling.

---

## 6. Design Philosophy, Ranked

You have been given multiple design traditions to operate under. They are
ranked here because they conflict in practice and ties must break
deterministically.

**Meta-rule (outranks all others):** Prefer simplicity until complexity is
required by the current sprint's spec. A pattern that is not called for by
the spec is a scope failure even if it would be defensible elsewhere.

**Rank 1 — Clean Code / SOLID (Uncle Bob):**

- Functions do one thing at one level of abstraction.
- Names reveal intent. No ambiguous abbreviations.
- No duplication of non-trivial logic. "Don't Repeat Yourself" applies at the
  concept level, not the character level — two functions that happen to have
  similar shapes but represent different concepts should stay separate.
- Dependency Inversion: depend on interfaces, not concretions, where the
  abstraction has at least two real implementations *in this codebase*.
  Speculative interfaces for "flexibility that might come later" are waste.

**Rank 2 — Good architecture (Gang of Four, Grady Booch):**

- Design patterns are named solutions to recurring problems. Use them when
  the problem is present, not because the pattern is elegant.
- UML-style thinking is useful for reasoning about component boundaries,
  sequence of operations, and state transitions. Produce diagrams in sprint
  docs when they clarify the contract; omit them when prose is clearer.
- Pattern choices must be justified in the sprint doc. "I used the Strategy
  pattern here because the three tool-execution modes have genuinely
  different branching logic and are unit-tested independently" is
  justification. "I used the Strategy pattern because it is a design
  pattern" is not.

**Rank 3 — Testing discipline:**

- Tests are not documentation. Tests assert behavior. Writing a test that
  merely re-describes the code without asserting meaningful behavior is
  noise.
- Every test must be able to fail. If you cannot articulate a change to the
  code that would cause the test to fail, delete the test.

**How ties break:**

- Simplicity beats SOLID when SOLID is speculative.
- Explicitness beats DRY when deduplication would force unrelated concepts
  into a shared abstraction.
- Tested code beats untested-but-elegant code.

**What not to do:**

- Do not introduce a Factory unless there are at least two concrete types
  being produced by the same construction path.
- Do not introduce an interface unless there are at least two
  implementations in the current codebase.
- Do not introduce a layer of indirection whose only justification is "for
  testability" — prefer to make the concrete code testable directly.
- Do not introduce a dependency injection container. Constructor
  injection and module-level composition roots are sufficient.

---

## 7. The Delivery Loop

Every sprint follows this sequence. You do not start step N+1 before step N
has been approved by the human.

1. **Feature spec.** You draft `docs/_specs/sprint-N-<name>/spec.md`. The
   spec states the problem, the invariants, the architecture, the acceptance
   criteria, and the out-of-scope items. For specs that touch more than one
   subsystem (e.g., a sprint adding a mutating tool AND its RBAC scope AND
   its audit log entry), use Sequential Thinking to reason through
   cross-subsystem invariants, edge cases, and sprint-to-sprint contracts
   before writing. For single-subsystem specs, skip it. Human QAs the spec.
2. **QA the spec.** You run a self-QA pass against the spec: inconsistencies,
   under-specification, conflict with the charter, conflict with prior
   sprints. Use Sequential Thinking for this pass when the spec is
   non-trivial — gap-finding is exactly the kind of structured reasoning it
   helps with. You produce `docs/_specs/sprint-N-<name>/spec-qa.md` listing
   every issue, or stating "no issues found" if genuinely none are found.
   Human confirms.
3. **Sprint plan.** You draft `docs/_specs/sprint-N-<name>/sprint.md` —
   named files to create or modify, numbered tasks, exact verification
   commands, completion checklist. Before naming library APIs in tasks,
   verify current signatures with Context7. Human QAs.
4. **QA the sprint plan.** You run a self-QA pass against the sprint plan:
   does it implement the spec, are the verification commands correct, is
   anything missing. Produce `docs/_specs/sprint-N-<name>/sprint-qa.md`.
   Human confirms.
5. **Implement the sprint.** You follow the sprint plan exactly. You do not
   add unrelated changes. You do not refactor adjacent code unless the plan
   names it. You run verification commands after each meaningful task, not
   only at the end. When writing code that calls a framework or library
   API, verify the current version's signature via Context7 before writing
   — do not rely on memory.
6. **QA the implementation.** You run a self-QA pass against both the spec
   and the sprint plan: does every checklist item hold, do the verification
   commands pass, are signatures and imports real, did anything slip.
   Produce `docs/_specs/sprint-N-<name>/impl-qa.md`.
7. **Move to next sprint only after the human confirms no issues remain.**

If any QA pass surfaces issues, you fix them and re-QA before the human
reviews. You do not move forward with known gaps.

---

## 8. Context Hierarchy

When instructions conflict, resolve in this order. Higher-numbered rules win.

1. The agent's own judgment or preferences
2. Suggestions from Studio Ordo in `docs/_references/`
3. Casual conversational instructions from the human in a single message
4. The current sprint's sprint doc
5. The current sprint's spec
6. This charter
7. Explicit written amendments to this charter signed by the human

If a conversational instruction appears to conflict with the charter, stop
and surface the conflict to the human. Do not silently resolve it.

---

## 9. Stop-The-Line Rules

You must stop and surface the issue to the human — not proceed, not
work-around — in any of these cases.

- The current sprint's spec is missing, incomplete, or internally
  inconsistent.
- The current sprint's sprint doc is missing or conflicts with the spec.
- A verification command fails and the fix would require scope outside the
  current sprint.
- The implementation would require adding a library, service, or pattern
  not authorized by the spec.
- The implementation would require modifying `docs/_references/` or any
  file in a prior sprint's delivered artifacts.
- The implementation would require committing a secret, credential, or API
  key.
- You cannot reconcile the charter's invariant with the current sprint's
  request.
- You notice drift from a prior sprint's contract (e.g., Sprint 4 built a
  tool registry, and the current sprint's work would bypass it).

Stopping is not failure. Stopping is the system working.

---

## 10. Verification Commands

Every sprint's verification surface, at minimum:

```
npm run typecheck
npm run lint
npm run test
```

Plus sprint-specific commands declared in the sprint doc. From Sprint 3
onward, also:

```
npm run eval:golden
```

A sprint is not complete until all declared verification commands pass from
a clean checkout. "It works on my machine" is not a verification. The sprint
doc records the exact command list; the impl-qa.md records the output
evidence.

---

## 11. Scope Discipline — What Not To Build, And What The Demo Must Enforce

### 11a. Patterns explicitly out of scope

These patterns exist in Studio Ordo or in other well-known AI projects. They
are out of scope for ContentOps. Do not add them.

- Deferred job queues, web push notifications, background workers
- Multi-provider model routing (Anthropic only)
- Multiple authentication methods (session cookies + seeded users only)
- Blog pipeline, marketing site, pricing page
- A full design system beyond a basic Tailwind component set
- Internationalization, localization, timezone handling beyond UTC storage
- Role hierarchies beyond the three named roles
- Workflow engines (Temporal, state machines framework)
- Feature flag systems beyond a `config/tools.json` tool-enable map
- Observability stacks (OpenTelemetry, Sentry, Datadog)
- Containerization beyond a single-service Docker setup if time permits
- Email verification, password reset, OAuth / SSO
- File upload on the deployed demo (local development only)

If a sprint's spec seems to require one of these, stop and surface the
question to the human before implementing.

### 11b. Demo-mode cost guardrails (required in production)

The deployed demo is exposed to the public internet and must not run up an
unbounded Anthropic bill. The following guardrails are required and must be
implemented before the demo URL is shared publicly. They are not optional.

- **Demo mode flag.** An environment variable `CONTENTOPS_DEMO_MODE` enables
  the guardrails below. Local development sets it to `false`; the deployed
  Vercel instance sets it to `true`.
- **Anonymous session rate limit.** Maximum 10 chat messages per anonymous
  session per rolling hour, enforced in middleware before the LLM call. The
  chat surface displays the remaining quota when fewer than 3 messages
  remain.
- **Daily global spend ceiling.** A SQLite counter tracks total Anthropic
  tokens consumed today across all sessions. When the ceiling is hit
  (default $2/day, configurable via env), the chat returns a fixed message
  explaining demo quota was reached and invites the reviewer to clone the
  repo for unlimited local use. Counter resets at 00:00 UTC.
- **Model selection.** The deployed demo uses `claude-haiku-4-5` by default.
  Local development may override to Sonnet or Opus via
  `CONTENTOPS_ANTHROPIC_MODEL`.
- **Anonymous role limit.** Anonymous visitors are restricted to Creator
  role by default. Role-overlay to Editor or Admin is available via a
  visible control, but mutating MCP tool calls that create external side
  effects (e.g., calendar writes to a real account) remain simulated in
  demo mode — they write to SQLite and produce an audit entry, but do not
  call out to third-party services.
- **Corpus is read-only on the demo.** Anonymous and overlaid visitors
  cannot upload, edit, or delete corpus documents on the deployed instance.
  The Side Quest Syndicate seed is fixed.

These guardrails are not scope creep; they are a required operational
surface for a publicly-deployed demo. A sprint that ships the demo URL
without them violates Section 9 (Stop-The-Line).

---

## 12. Writing Style For Artifacts

Spec files, sprint docs, QA reports, and code comments follow these rules.

- Declarative prose. No filler ("this spec aims to," "let's now consider").
- No marketing language. No "robust," "seamless," "cutting-edge," "elegant."
- No hedging. "This endpoint returns X" is correct; "This endpoint should
  typically return X" is not, unless the word "typically" is factually load-
  bearing.
- Code blocks for code. Tables for comparable data. Numbered lists for
  ordered steps. Bullet lists for unordered items. Prose for reasoning.
- Short. If a section can be half as long without losing meaning, make it
  half as long.

If the charter author (the human) catches filler language, rubber-stamp QA
("LGTM"), or scope creep in your output, that is a charter violation. Treat
it the same as a failed test.

---

## 13. The First Task

When the human confirms this charter is accepted, your first and only action
is to draft Sprint 0's spec at `docs/_specs/sprint-0-foundation/spec.md`.

Sprint 0's subject is the project foundation: Next.js 16 App Router, React 19,
TypeScript strict mode, Tailwind CSS 4, SQLite via `better-sqlite3`, Vitest,
environment validation via Zod, a single seeded user, and a minimal placeholder
page at `/`. No chat UI yet. No auth logic yet. No RAG yet. The spec describes
the foundation and nothing beyond it.

Sprint 0 must additionally anticipate the deployment target:

- The SQLite database path must be configurable via env var so a serverless
  or ephemeral-filesystem runtime can mount a persistent volume at a known
  location. Local development defaults to `./data/contentops.db`; production
  reads `CONTENTOPS_DB_PATH`.
- The env schema (Zod) must include `CONTENTOPS_DEMO_MODE`,
  `CONTENTOPS_ANTHROPIC_MODEL`, `CONTENTOPS_DAILY_SPEND_CEILING_USD`, and
  `CONTENTOPS_DB_PATH`, even if the features backed by these vars arrive in
  later sprints. Declaring the full env surface in Sprint 0 prevents
  retrofitting.
- A Vercel-compatible build must succeed (`npm run build`) at the end of
  Sprint 0, producing a deployable artifact even though the page is a
  placeholder. Sprint 0 does not deploy; Sprint 0 proves it *can* deploy.

The spec must include:

- Problem statement
- Invariants (from this charter, plus sprint-local ones)
- Architecture (file layout, chosen libraries with versions, env variable
  list)
- Acceptance criteria (what a reviewer can verify)
- Verification commands
- Explicitly out-of-scope items

Do not write code. Do not scaffold the repository. Do not install packages.
Draft the spec, then stop and wait for the human to QA it.

---

## 14. Amendments To This Charter

The charter may be amended by the human at any time. Amendments are made by
editing this file and incrementing the version number at the top. The agent
treats the latest version as authoritative.

The agent does not edit this charter. Proposals for amendment are surfaced to
the human in prose; the human decides.

---

## 15. MCP Tool Usage (Context7, Sequential Thinking)

Two MCP tools are available to the agent across all sprints. They exist to
close specific failure modes, not to be used indiscriminately. Using them
well conserves premium-request budget; using them poorly burns it.

### 15a. Context7 — library documentation grounding

**Purpose.** Fetch current documentation for the specific version of a
library declared in `package.json`. The agent's training data is stale for
Next.js 16 (App Router changes), React 19 (server components, `use()`,
Actions), Tailwind CSS 4 (CSS-first config, new engine), the Anthropic SDK
(tool use, message format), and `better-sqlite3`.

**When to use.**

- Before naming a library API in a spec, sprint doc, or QA report.
- Before writing a line of code that imports from or calls one of the
  libraries listed above.
- When a verification command fails with an API-not-found or
  argument-shape error.
- When the agent's training-data memory of an API conflicts with what the
  `package.json` version would suggest.

**When not to use.**

- For libraries the agent is already confident about at the pinned version
  and that have stable APIs (e.g., `zod`, `vitest` core API, standard
  Node built-ins).
- For general architectural reasoning where library syntax is not the
  question.
- To decide *which* library to use. Library choices are set by the spec,
  not by Context7 lookups.

**Failure mode Context7 specifically prevents.** The agent writes plausible
Next.js 13-era code while claiming it is Next.js 16, tests pass against its
own mocks, and the runtime fails at deployment. This is a repeated failure
mode for agents building on recently-updated frameworks.

### 15b. Sequential Thinking — structured reasoning

**Purpose.** Work through multi-step, multi-constraint problems step-by-step
with explicit intermediate state, rather than producing an answer in one
pass. Helps for spec drafting, QA gap-finding, sprint planning, and
debugging subtle state bugs.

**When to use.**

- Drafting a spec that spans more than one subsystem (e.g., tool + RBAC +
  audit log at once).
- QA passes on any non-trivial spec or implementation.
- Reasoning about invariants that must hold across sprints (e.g., "does
  this Sprint 5 change violate the Sprint 4 tool-registry invariant?").
- Debugging a bug whose cause is not obvious from the stack trace.

**When not to use.**

- For mechanical tasks: writing a type definition, a standard test, a
  small pure function, boilerplate. These do not benefit from structured
  reasoning and burn budget.
- For library syntax questions. Those are Context7's job.
- For decisions already made (stack, RBAC roles, sprint order). Do not
  use Sequential Thinking to relitigate a closed question.

**Failure mode Sequential Thinking specifically prevents.** The agent
produces confident-sounding specs that overlook an edge case, a
cross-sprint contract, or an invariant — and the gap is only caught
during implementation three sprints later. Structured reasoning surfaces
these gaps at spec time, when they are cheap to fix.

### 15c. What neither tool is for

- **Neither tool may be used to override the declared stack.** The stack
  (Next.js 16, React 19, TypeScript strict, Tailwind 4, SQLite via
  `better-sqlite3`, Vitest, Zod, Anthropic SDK) is set by Section 5 and
  Section 13. Context7 grounds the agent on how to *use* those libraries.
  It does not license swapping them. If Sequential Thinking surfaces a
  reason to change the stack, that reason is surfaced to the human as a
  proposed amendment to the charter — not acted on directly.
- **Neither tool may be used to expand scope.** If Sequential Thinking
  "suggests" adding a feature not called for by the current sprint spec,
  that suggestion is a Section 6 violation (the simplicity meta-rule) and
  must be ignored.
- **Neither tool may be used to justify skipping a verification command.**
  "Sequential Thinking concluded the code is correct" is not a substitute
  for `npm run test` passing.

### 15d. Budget discipline

Premium tool calls cost budget. The agent is expected to use both tools
when they genuinely help and skip them when they do not. If in doubt:
Context7 is cheap and worth calling; Sequential Thinking is expensive and
should be reserved for specs, QA passes, and hard debugging.

---

---

## 16. The 11-Sprint Roadmap

ContentOps is delivered in 11 sprints (Sprint 0 through Sprint 10).

1.  **Sprint 0 — Foundation (complete):** Next.js 16, React 19, TS Strict, Tailwind 4, SQLite, Vitest, Zod, and placeholder page.
2.  **Sprint 1 — Homepage Chat UI + Streaming Shell (complete):** Polished light editorial UI, deterministic mock streaming, and scroll architecture.
3.  **Sprint 2 — Sessions, SQLite Message History, and Role Overlay (complete):** Conversations/messages tables, signed cookies, and role switcher (Creator/Editor/Admin).
4.  **Sprint 3 — Anthropic Streaming Chat + Demo Cost Guardrails (complete):** Real LLM integration with token-counting and daily spend limits. Markdown rendering and chat scroll architecture also fixed post-sprint.
5.  **Sprint 4 — Seed Corpus + RAG Ingestion Foundation (complete):** Document ingestion, chunking, and embedding storage in SQLite.
6.  **Sprint 5 — Hybrid RAG Retrieval + Grounded Chat (complete):** Vector + BM25 retrieval and grounded assistant responses. 77 tests passing.
7.  **Sprint 6 — AI Eval Harness (complete):** Automated groundedness and retrieval quality metrics. Golden eval: 5/5 cases passing, 86 tests total.
8.  **Sprint 7 — Tool Registry + Read-Only MCP Tools:** RBAC-aware tool registry and scaffolding at least one custom MCP server per Section 5 item 3.
9.  **Sprint 8 — Mutating Tool + Audit Log + Rollback:** State-changing tools with compensating actions and history.
10. **Sprint 9 — Operator Cockpit Dashboard:** Live state, actions, approvals, and eval health surface.
11. **Sprint 10 — Demo Deployment + README + Loom:** Vercel deployment, final documentation, and demo recording.

---

### Changelog

- **v1.3** — Sprint plan reordered to 11 sprints. AI Eval Harness moved from late-project (former Sprint 9) to Sprint 6, positioned after RAG retrieval lands and before tools/mutations/cockpit add complexity. Sprint 10 becomes a focused deployment and portfolio closeout (Vercel deploy, README, Loom) rather than a catch-all. Sprint 7 explicitly includes scaffolding at least one custom MCP server per Section 5 item 3.
- **v1.2** — Added Context7 verification requirement to Section 1 (session
  startup) and Section 7 (delivery loop steps 3 and 5). Added Sequential
  Thinking recommendation to delivery loop steps 1 and 2. Added Section 15
  governing MCP tool usage: Context7 for library grounding, Sequential
  Thinking for structured reasoning, with explicit exclusions (neither
  tool overrides the stack, expands scope, or justifies skipping
  verification).
- **v1.1** — Added hard requirements 11 (live demo deployment with cost
  guardrails) and 12 (seed-only corpus on the demo). Expanded Section 11 into
  11a (out-of-scope) and 11b (required demo-mode guardrails: rate limit,
  daily spend ceiling, model pinning, anonymous-role limits, read-only
  corpus). Updated Section 2 framing from "local-first" to
  "locally-runnable, publicly-demoable." Added Vercel-awareness to Sprint 0
  in Section 13 (configurable DB path, full env schema declared upfront,
  build must succeed).
- **v1.0** — Initial charter.

---

**End of charter.**