---
name: optimization
description: Run a 3-phase, multi-agent optimization analysis on a target (file, module, feature, or topic) in this repo. Phase 1 reconstructs design intent from the code, Phase 2 grounds the analysis in current docs (Context7) and external best practices (web search) in parallel, Phase 3 synthesizes a ranked recommendation plan. Recommendations only — does not apply changes. Use when the user asks to "optimize X", "review X for improvements", "audit X", or runs `/optimization <target>`.
---

# Optimization Skill (ContentOps)

A bounded, three-phase optimization workflow for the ContentOps codebase. Produces a ranked recommendation plan; **does not modify code**.

## Argument

`<target>` — the thing to optimize. May be:
- A file path (`src/lib/rag/retrieve.ts`)
- A module / directory (`src/lib/tools/`)
- A feature name (`audit + rollback`, `chat streaming`, `RAG retrieval`)
- A cross-cutting topic (`performance`, `dead code`, `legacy code`, `security`, `type safety`, `accessibility`, `DX / CI`, `error handling`)

If the target is ambiguous, ask one clarifying question before starting Phase 1. Otherwise proceed.

## Charter constraints (read before generating any recommendation)

ContentOps is governed by [docs/_meta/agent-charter.md](../../../docs/_meta/agent-charter.md). The following recommendations are **out of scope** and must not be proposed:

- Deferred job queues, web push, background workers, schedulers, cron
- Multi-provider model routing (Anthropic only)
- Multiple auth methods beyond session cookies + seeded users
- Workflow engines (Temporal, state-machine frameworks)
- Feature-flag systems beyond `config/tools.json`
- Observability stacks: OpenTelemetry, Sentry, Datadog, Honeycomb, etc.
- Containerization beyond a single-service Dockerfile
- i18n / l10n, timezone handling beyond UTC storage
- Email verification, OAuth / SSO, password reset
- Postgres / external DB; the project is SQLite-only by §5 of the charter
- Speculative interfaces / DI containers / "for testability" indirection (charter §6)
- File upload on the deployed demo (local-only)

When recommending optimizations, also respect:
- **The architectural invariant** (charter §4): the model's prompt-visible tools and runtime-executable tools must come from a single registry, filtered by the same RBAC. Any recommendation that splits these is rejected.
- **Simplicity meta-rule** (charter §6): a pattern not called for by the current sprint spec is a scope failure even if defensible elsewhere. Three similar lines beats premature abstraction.
- **Spec-driven workflow** (charter §7): substantial changes belong in a sprint spec, not in a recommendation that bypasses it. Frame larger items as "candidate sprint scope."
- **Documented deferred debt** ([agent-charter.md changelog v1.8 / v1.10](../../../docs/_meta/agent-charter.md)): `ON DELETE CASCADE` on declared FKs + `workspace_id` FK CASCADE on the 6 workspace-scoped tables; FTS5 + BM25 hybrid retrieval. These are pre-blessed — call them out explicitly when relevant.

If a recommendation would violate any of the above, drop it. If it would improve the project but conflicts with charter scope, surface it as **"charter-amendment proposal"** rather than as a normal recommendation.

## The Three Phases

Run all three phases for every invocation. Phases 1 and 3 are sequential; Phase 2 has two parallel sub-agents.

---

### Phase 1 — Discovery (1 agent, sequential)

**Subagent type:** `Explore` (read-only, fast, focused on locating + reading files).

**Goal:** build a complete map of the target before any external research happens.

**Tasks:**
1. **Read every file in scope of `<target>`.** Be exhaustive within reason — for a module, every `.ts`/`.tsx` file in the directory plus its `*.test.ts` counterparts. For a feature, follow imports across modules. For a topic, identify the entry points and walk them.
2. **Map the dependency graph.** For each file in scope:
   - Callers (who imports / invokes this?)
   - Callees (what does this import / invoke?)
   - Tests (which `*.test.ts` files cover this?)
   - Configs / docs (which spec, sprint doc, or arch.md section governs this?)
3. **Reconstruct the original design intent.** Why was this written this way? Cross-reference the relevant `docs/_specs/sprint-N-*/` folder and `docs/_meta/architecture.md` §8 ("Key design decisions") to find the *justification*, not just the *what*. Capture explicit trade-offs the author already considered.
4. **Identify current pain points.** Concrete: latency hotspots, places where contributors have left "TODO", "XXX", "HACK", or "for now" comments, places where the test count is suspiciously thin, redundant work (recomputation, repeat queries), inconsistent patterns vs the rest of the codebase.
5. **Note constraints.** Sprint scope, charter forbids, RBAC boundaries, workspace-scoping discipline, the audit-row-in-transaction invariant, demo-mode guardrails, FK ordering rules.

**Output: discovery report** (markdown, in-memory or returned to parent — do not write to disk):

```markdown
## Phase 1 — Discovery: <target>

### Scope
- Files in scope: [...]
- Tests: [...]
- Specs / docs: [...]

### Dependency graph
- Callers: [...]
- Callees: [...]
- External libs touched: [...]

### Design intent
[1-2 paragraphs reconstructing why this was written this way, citing the
sprint spec / arch.md / charter section that justifies it.]

### Current pain points
- [observation 1, with file:line citation]
- [observation 2, ...]

### Constraints
- Charter: [relevant §s]
- Architectural invariants touched: [...]
- Sprint scope: [current sprint, what it forbids]
```

---

### Phase 2 — Research (2 agents, in parallel)

Run **both agents at the same time** (single message, two `Agent` tool calls). They are independent; their reports merge in Phase 3.

#### Agent 2 — Library / API documentation (Context7)

**Subagent type:** `general-purpose` (needs MCP tool access to `mcp__context7__*`).

**Goal:** ground the analysis in the actual API surface of the libraries and frameworks at the versions declared in [package.json](../../../package.json).

**Tasks:**
1. Identify which libraries are touched by the in-scope files (from Phase 1's dependency graph).
2. For each non-trivial one (not stdlib, not stable like `zod`), call `mcp__context7__resolve-library-id` and then `mcp__context7__query-docs` with a focused query that matches the optimization angle.
3. **Pin the version.** Always quote the version from [package.json](../../../package.json) and check that the docs returned match that version. If Context7 only has docs for a different major, say so explicitly — do not paper over the gap.
4. Capture: API additions / removals since the version we pin, deprecation warnings, version-specific best practices (e.g., Next.js 16 server-component caching changes, React 19 Actions, better-sqlite3 prepared-statement reuse, Anthropic SDK tool-use streaming patterns).

**Libraries that are high-yield to research** (pre-identified for ContentOps):
- `next@^16.2.4` — App Router caching, `serverExternalPackages`, route segment config, `outputFileTracingIncludes`, streaming `Response` patterns
- `react@^19.2.5` — `use()`, Actions, server-component boundaries, suspense
- `@anthropic-ai/sdk@^0.90.0` — tool-use loop, streaming `.on('text')` vs `.on('contentBlock')`, beta features, prompt caching
- `better-sqlite3@^12.9.0` — prepared statement reuse, transaction modes, FK pragma defaults, WAL tuning
- `@huggingface/transformers@^4.2.0` — pipeline caching, WASM-vs-Node backends, model bundling
- `@modelcontextprotocol/sdk@^1.12.0` — stdio transport lifecycle, capability negotiation
- `tailwindcss@^4.2.4` — v4 PostCSS plugin, CSS-first config, layer ordering
- `zod@^3.25.0` — `safeParse` vs `parse`, schema composition, Zod 4 migration concerns
- `vitest@^4.1.5` — workspace mode, `inline.deps`, `setupFiles` patterns
- `@playwright/test@^1.58.2` — webServer reuse, fixtures, trace collection

**Output: docs report** with one section per library inspected. Each section: pinned version, what we use it for here, any version-specific guidance that changes our optimization options, citations.

#### Agent 3 — External best practices (web search)

**Subagent type:** `general-purpose` (needs `WebSearch` and `WebFetch`).

**Goal:** find what the broader engineering community has learned about the patterns we use, with a strong preference for sources from the last ~2 years.

**Tasks:**
1. From Phase 1, derive 3–6 focused search queries. Examples:
   - "Next.js 16 App Router NDJSON streaming patterns 2025"
   - "BM25 vs FTS5 SQLite hybrid retrieval benchmarks"
   - "better-sqlite3 prepared statement reuse performance"
   - "React 19 server component data fetching patterns"
   - "Anthropic Claude tool-use loop iteration limits practice"
2. Prefer: official engineering blogs, well-cited Stack Overflow answers, library maintainer posts, recent conference talks. Avoid: SEO content farms, AI-generated listicles.
3. Capture: benchmarks (with numbers), common pitfalls, anti-patterns the community has converged away from, recent changes worth knowing.

**Output: practices report** with each finding tagged by: source, date, applicability to ContentOps, confidence (high/medium/low).

---

### Phase 3 — Synthesis (parent / lead agent, sequential)

The lead agent (the one that ran the skill) merges Phases 1 and 2 into a ranked recommendation plan.

**Method:**
1. **Combine.** For each pain point in Phase 1, look for: (a) Context7 docs that confirm or refute the assumed API behavior, (b) external practices that propose a known-good pattern.
2. **Rank by impact / risk ratio.** Highest impact + lowest risk first. "Risk" includes: surface area of the change, test coverage of the affected code, charter scope tension, sprint disruption.
3. **Cross-check the charter.** Drop anything in the charter's out-of-scope list (§11a). Surface anything that requires a charter amendment as a separate "charter-amendment proposal" item.
4. **For each recommendation, produce:**

```markdown
### R<N> — <one-line summary>

**Topic:** [performance | dead code | legacy code | security | type safety | testing | error handling | DX]
**Impact:** [high | medium | low] — <one sentence on what this unlocks>
**Effort:** [S | M | L] — <rough estimate: hours / days / sprint>
**Risk:** [low | medium | high] — <what could go wrong>
**Charter:** [in-scope | charter-amendment proposal | deferred-debt blessed]

**Rationale.** [Why this matters; cite Phase 1 finding + Phase 2 evidence.]

**Concrete suggestion.** [Diff-level: which file(s), which function(s), what
to change. If a small patch, sketch it. If a bigger refactor, describe the
shape and name the spec it would belong in.]

**Validation.** [How we'd know it worked: which test or benchmark or eval
case to add / re-run.]
```

5. **Order by rank.** R1 = highest impact / lowest risk. Bottom of the list = recommendations the team should *consider but not commit to.*
6. **End with:** an explicit "do not pursue" section for things that came up but were rejected (with reason), so future reviews don't re-litigate.

**Recommendations only — do NOT apply changes.** The skill's contract is to give the operator a ranked menu. They pick the route.

---

## Anti-patterns to refuse

If asked to optimize in any of these directions, push back instead of complying:

1. **"Add caching to make X faster."** Caching is a last resort — first prove the underlying work is necessary. If it is, prefer killing the redundant work over caching its result.
2. **"Refactor for testability."** Charter §6 forbids indirection introduced solely for testability. If the concrete code is hard to test, fix the concrete code.
3. **"Add an interface for future flexibility."** Charter §6: no speculative interfaces. Two real implementations in *this* codebase or no interface.
4. **"Add observability with [OpenTelemetry / Sentry / Datadog]."** Out of scope by §11a. If logging is the actual problem, propose plain `console.log` or a thin `src/lib/log.ts` with a level switch.
5. **"Migrate from SQLite to Postgres."** Out of scope by §5. SQLite is a hard requirement.
6. **"Switch from Anthropic to a multi-provider abstraction."** Out of scope by §11a.
7. **"Add a job queue for the embedding pipeline."** Out of scope by §11a. Lazy init and synchronous is the design.

## Examples

**Invocation:** `/optimization src/lib/rag/retrieve.ts`
- Phase 1: discovery agent reads `retrieve.ts`, `bm25.ts`, `embed.ts`, `chunk-document.ts`, the rag tests, sprint-5-rag-retrieval/*, arch.md §5B + §10 risks.
- Phase 2 (parallel): Context7 on `better-sqlite3` prepared-statement APIs + `@huggingface/transformers` pipeline lifecycle; web search on "BM25 SQLite FTS5 hybrid retrieval", "RRF fusion k-parameter tuning", "@huggingface/transformers Node WASM cold start".
- Phase 3: ranked plan including, e.g., R1 prepared-statement reuse for the per-chunk SELECT, R2 FTS5 migration as charter-blessed deferred debt, R3 pipeline warm-up at boot, etc.

**Invocation:** `/optimization performance` (a topic, not a file)
- Phase 1: discovery agent identifies all hot paths in the chat / retrieve / mutate pipelines, reads each entry point.
- Phase 2: same parallel structure, queries widened to "Next.js 16 streaming response performance", "better-sqlite3 transaction overhead".
- Phase 3: cross-cutting plan with hot-path-by-hot-path breakdown.

## Done

When Phase 3 is complete:
- Print the ranked plan inline in the conversation.
- Do **not** create any files unless the user explicitly asks for a written report.
- Do **not** implement anything. Stop and let the operator decide.
