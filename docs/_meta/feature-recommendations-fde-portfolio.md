# Feature Recommendations — FDE / Applied-AI Portfolio Polish

**Author:** Cascade
**Date:** 2026-05-04
**Audience:** Operator + future portfolio reviewers
**Companion to:** [agent-charter.md](agent-charter.md), [job-technology-project-assignment.md](../job-technology-project-assignment.md), [target-job-links-and-claude-code-notes.md](../target-job-links-and-claude-code-notes.md)
**Status:** Recommendations — none committed to charter §16 until explicitly authorized.

---

## 1. Context

ContentOps is the portfolio submission for the Job Technology Project Assignment. The target professional direction is **Forward Deployed Engineer / AI Product Engineer / Applied AI Engineer**, with concrete role targets including Doing Things, Distyl AI, Actively AI, Revin, Thread AI, Anthropic, and OpenAI ([target-job-links](../target-job-links-and-claude-code-notes.md)). Doing Things at $110-130k is flagged "strongest fit, apply first." Anthropic's note explicitly says "ContentOps maps directly to the role."

Per the assignment ([job-technology-project-assignment.md](../job-technology-project-assignment.md) §6, §7, §8), the project must:
- Solve a clear problem
- Demonstrate the targeted skill or technology
- Work reliably
- Look reasonably polished
- Include automated testing
- Live as a clean GitHub repo with a clear README and run instructions

Sprint 9 just shipped (operator cockpit + typing indicator). Sprint 10 (UI polish pass) is committed (`1f646c7 implemented sprint10`). The only remaining charter sprint is **Sprint 11 — Demo Deployment + README + Loom**. Charter §16 currently caps the roadmap at 12 sprints (0 through 11).

This doc is exploratory: it lists candidate features that would strengthen the FDE-portfolio framing **after Sprint 11 ships**, not in place of it. Nothing here is a charter amendment until the operator approves one.

---

## 2. Honest read on sequencing

**Ship Sprint 11 first.** The portfolio reviewer experience is:

1. Clicks the README link
2. Clicks the demo URL
3. Watches the Loom
4. Skims the architecture diagram
5. Reads `git log --oneline` to gauge cadence

A deployed live demo + a tight 5-minute Loom outranks any single feature addition. New features added before deployment delay the moment when the project is actually *visible* to reviewers. The existing feature surface is already FDE-grade — what's missing is the surface area for a reviewer to *encounter* it.

After Sprint 11, the highest-impact polish is concentrated in two or three **trace / debug / iterate** features that an FDE recognizes immediately. Those are scoped below.

The assignment rubric does not reward complexity for its own sake (§5: "The goal is not to build the biggest thing possible. The goal is to build something focused, believable, and well executed."). Resist the urge to keep adding.

---

## 3. Current strengths (recap, for grounding)

| Capability | Sprint | Why it scores |
|---|---|---|
| Anthropic streaming + tool-use loop | 3, 7 | Demonstrates LLM integration depth, not API-call demos |
| Hybrid RAG (vector + BM25 + RRF) | 4, 5 | Real retrieval architecture, not a one-shot embedding lookup |
| Deterministic eval harness (5 golden cases) | 6 | Measurement discipline — rare in student projects |
| RBAC at registry + middleware + API | 2, 7, 8 | Shows production-thinking on permissions |
| Audit log + atomic rollback | 8 | Operationally serious; the "Undo" affordance is concrete |
| Operator cockpit | 9 | Surfaces all agent activity in one place |
| Custom MCP server | 7 | Anthropic-native interop; few portfolio projects ship one |
| 168 Vitest + 2 Playwright + 5/5 eval | All | Coverage signal for the §7 testing requirement |

That's already a strong FDE portfolio. The features below are *additive*; none of them are required for credibility.

---

## 4. What FDE roles look for that we don't yet show

Based on the role descriptions linked in [target-job-links](../target-job-links-and-claude-code-notes.md):

- **Trace / replay debugging.** When a customer reports "the agent did the wrong thing," the first FDE action is reconstructing the input → retrieved-context → prompt → model-output → tool-call chain. Currently ContentOps stores the input and output JSON in `audit_log`, but the *retrieved chunks*, *assembled system prompt*, and *per-turn token counts* are not preserved past the streaming turn.
- **Prompt iteration with measurement.** FDEs spend significant time editing system prompts and watching eval scores. The harness exists; there's no UI that closes the loop.
- **Reliability primitives.** Retries, timeouts, fallbacks. Currently the chat route trusts the Anthropic SDK's defaults. Real FDE work hardens this.
- **Production observability.** Latency-per-tool charts, error rates, token-per-turn trends. The cockpit shows today's spend and audit history; it doesn't yet show *behavior over time*.
- **Human-in-the-loop gates.** Some tools should pause for operator approval before executing (e.g., a `publish_post` tool). ContentOps's mutating tools currently execute immediately and rely on Undo for recovery. A pre-execution approval flow is a different (often required) pattern.

Of these, only one — **trace/replay** — is genuinely missing data. The others are *unbuilt UIs over data we already have or could trivially capture*.

---

## 5. Tier A — Recommended after Sprint 11 (one-sprint scope each)

### A1. Trace inspection panel (highest leverage)

**The pitch.** Click any audit-log row in the cockpit → modal opens showing the full trace: user message, retrieved chunks (with hybrid-retrieval scores), assembled system prompt, tool input, tool output, and the final assistant text. This is the artifact every FDE wishes their predecessor had built.

**Data work.** Extend `audit_log` with optional `trace_json` column (or a sibling `audit_traces` table — TBD). The chat route already has all the data in scope at the moment a tool executes; it just doesn't persist it. Capture: retrieved chunk IDs + scores, the constructed system prompt (or a hash + version), the message history at call time. Add the field to `writeAuditRow` opts.

**UI work.** New `<TraceModal />` opened from a "View trace" button on each `AuditFeedPanel` row. Read-only. Renders sections: Conversation context · Retrieval (chunks + scores) · System prompt · Tool input · Tool output.

**TDD.**
- Unit: trace projection (audit row + retrieval log → trace shape).
- Integration: chat route persists trace fields when a mutating tool runs; round-trip through DB.
- Component: `<TraceModal />` renders all sections from a sample trace fixture.
- E2E: existing cockpit smoke extended with "click View trace, assert sections visible."

**Ordo borrow.** Worth a fresh look at [docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolMiddleware.ts](../_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolMiddleware.ts) — Sprint 8 declined Ordo's full middleware composer because we only had one wrap concern (audit). With trace capture as a second wrap, the composer pattern starts to earn its complexity. If we add a third wrap later (latency timing), the composer is justified. Cite Ordo's file when borrowing.

**Sprint slot.** Proposed Sprint 12 — "Trace Inspection." ~2-3 days TDD-first.

---

### A2. Prompt iteration UI with eval feedback

**The pitch.** Operator opens a "Prompt iteration" panel in the cockpit, edits the system-prompt template, clicks "Run eval" → backend runs `runGoldenEval` against the candidate prompt, returns score delta (vs. last run). Operator can save the candidate as the new live prompt. **Most FDE roles list this exact workflow as a daily activity.**

**Data work.** Add `prompt_versions` table: `id, name, body, created_at, created_by, score, score_delta, is_active`. The system-prompt template at [src/lib/chat/system-prompt.ts](../../src/lib/chat/system-prompt.ts) becomes the seed `default-v1` row. Chat route reads the `is_active` row at request time.

**UI work.** New `<PromptIterationPanel />` (Admin-only). Two textareas (current vs. candidate), "Run eval" button, score-delta badge. Saves candidate as new version on demand.

**Eval cost.** Each "Run eval" click costs ~5 Anthropic API calls (one per golden case, but the eval harness today only does retrieval — no LLM. Verify.) Either way, cap to Admin-only and show a confirmation modal.

**TDD.**
- Unit: prompt version round-trip; `is_active` uniqueness invariant.
- Integration: chat route reads active prompt version; eval runs against candidate.
- Component: panel render + diff view.

**Ordo borrow.** Ordo's eval cohorts pattern is worth a peek but is bigger than we need. Borrow only the "candidate prompt produces score" loop, not the full cohort/observation infra. Cite if borrowing.

**Sprint slot.** Proposed Sprint 13 — "Prompt Iteration." ~3 days TDD-first.

---

### A3. Latency / tokens-over-time charts in the cockpit

**The pitch.** The cockpit's Spend panel shows today's totals. Add a small line chart of *per-turn tokens-in / tokens-out / latency over the last 24h*, sourced from `messages.tokens_in` and `messages.tokens_out` (already captured). Three lines, one tiny chart. Adds visual "production observability" to the cockpit.

**Data work.** None. Data is already in `messages`. Need a small query helper `listRecentTurnMetrics(db, { sinceHours: 24 })`.

**UI work.** Add a chart library only if needed. Tailwind + raw SVG can render a simple sparkline in <50 lines. Recharts (~30KB) is overkill for a single chart but fine if we want polish.

**TDD.** Query test (orders DESC, filters by since); component test (renders three lines from a fixture).

**Ordo borrow.** None. Original.

**Sprint slot.** Could fold into A1's sprint (Sprint 12) as a small extra panel. **Optional.**

---

## 6. Tier B — Worth considering, larger scope

### B1. Human-in-the-loop tool approval

**Pitch.** A tool descriptor can declare `requiresApproval: true`. When the LLM invokes it, the chat route posts a "pending approval" row instead of executing. The cockpit shows pending requests; Admin clicks Approve/Deny. On approve, the tool runs; on deny, the chat route returns `tool_result` with an error.

**Why this is bigger.** Changes the tool-use loop's contract. The chat route currently expects synchronous tool execution; an approval flow means the LLM iteration pauses indefinitely, which conflicts with the per-request streaming model. Probably needs a polling client or a long-poll endpoint.

**FDE relevance.** Very high — many FDE customer engagements demand this. But the implementation is non-trivial.

**Sprint slot.** Proposed Sprint 14 — "Approval Gates." ~5 days TDD-first. Skip unless interview rounds specifically ask "have you built an approval flow?"

### B2. Conversation memory pinning

**Pitch.** Operator pins a fact ("Brand voice is friendly but precise") that's injected into every subsequent system prompt for that conversation. Persists per-conversation in a new `conversation_memories` table.

**Why moderate scope.** Touches the system-prompt assembly layer, the cockpit (a manage-memories UI), and the chat persistence model. Not hard, but real work.

**FDE relevance.** Moderate. "Long-term memory" is a hot topic but easily over-engineered. ContentOps's RAG already provides retrieval-style memory.

**Sprint slot.** Skip unless A1+A2 ship and we want a third trace/iterate/memory triad.

### B3. Tool-execution middleware composer (Ordo borrow, finally)

**Pitch.** Replace the inline audit-write hook in the registry with a composable middleware chain: `[auditMiddleware, traceMiddleware, latencyMiddleware]`. Each middleware wraps `execute()`. Pattern from [docs/_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolMiddleware.ts](../_references/ai_mcp_chat_ordo/src/core/tool-registry/ToolMiddleware.ts).

**Why we declined this in Sprint 8.** Charter §6 simplicity — one wrap concern, no composer needed. **If A1 (trace) + A3 (latency) ship**, we now have three wrap concerns. The composer pattern earns its weight.

**FDE relevance.** Moderate-high — middleware composition is a standard architectural pattern reviewers expect.

**Sprint slot.** Bundle with A1 as a refactor task. Or defer until A3 lands.

---

## 7. Tier C — Speculative; worth knowing exist

These are mentioned for completeness; **don't build them for the portfolio submission**.

- **Multi-tenant** — auth, per-tenant DB, per-tenant cost limits. Real product work but a 4-week scope.
- **External MCP client** — consume someone else's MCP server (e.g., a GitHub MCP). Demonstrates the MCP ecosystem participation but adds little we can't already articulate.
- **Background job queue** — for long-running tools. Real FDE primitive but introduces a worker-process architecture that doesn't fit a single-binary demo.
- **Synthetic eval generation** — generate golden cases from real conversations marked "good" by the operator. Useful but Sprint-13's prompt iteration probably scratches the same itch.
- **Provider abstraction** — multi-provider routing across Anthropic / OpenAI / etc. ContentOps is single-provider by charter. Don't build this.

---

## 8. Polish gaps in the existing repo (low-cost wins)

These are **not** new features. They're shipped-quality polish that fits in Sprint 11 (deployment closeout):

- [ ] `LICENSE` file (MIT — the standard portfolio choice).
- [ ] `CHANGELOG.md` — auto-generate from `git log --oneline | grep '^[a-f0-9]\\+ feat\\|fix' | ...`. Or hand-curate from the sprint commits.
- [ ] A small animated GIF or 30-second mp4 in the README — "demo at a glance" visible without clicking through to Loom.
- [ ] Test coverage badge in the README (Vitest's `--coverage` output → README badge).
- [ ] Top-of-README "Try it" button linking the Vercel deploy + the demo's role-overlay so a reviewer can click through as Admin in two seconds.
- [ ] Architecture diagram as an SVG (the ASCII one in the README is fine, but an actual SVG renders crisper on GitHub mobile).

The `LICENSE`, `CHANGELOG.md`, and Vercel "Try it" button alone close 70% of the polish gap and take an afternoon.

---

## 9. TDD discipline — non-negotiable for any addition

Every Tier A / B feature lands with:

1. **Failing test first** for the smallest observable behavior change (state machine transition, panel render branch, server-action RBAC throw).
2. **Implementation** that makes the test pass.
3. **Per-task verification gate** (existing sprint pattern — `npm run typecheck && npm run test -- <file>`).
4. **Characterization tests** before *any* edit to a Sprint 7-9 file. Run the existing tests, capture output, edit, re-run, diff. Sprint 9 §10.3 / Sprint-QA M2 pattern.
5. **No "fix lint by suppressing"** — Sprint 9 introduced two file-level `biome-ignore-all` directives for the `useValidAriaRole` false positive on the `role` JSX prop. Future props in this category should rename to `viewerRole` or similar (already done for `AuditFeedPanel`) instead of suppressing.

Test-count target for any new sprint: roughly **+10-25 Vitest tests** to match Sprint 7-9 sprint averages. Do **not** add tests for tests' sake; cover state and behavior, not aesthetics (per charter §16 v1.6 aesthetic-verification policy).

---

## 10. Reference borrows from `docs/_references/ai_mcp_chat_ordo/`

Ordo is *consulted, not imported* (per [docs/_references/README.md](../_references/README.md)). The patterns most worth re-considering after Sprint 11:

| Ordo file | When to borrow | What to borrow | What NOT to borrow |
|---|---|---|---|
| `src/core/tool-registry/ToolMiddleware.ts` | When Tier A1 + A3 land (3 wrap concerns) | The wrapping concept + the middleware-list shape | Ordo's full hook-system breadth (we have 1 RBAC concern, not 5) |
| `src/lib/db/tables.ts` (audit shape) | A1 trace storage | The append-only shape we already adopted in Sprint 8 | Already borrowed; nothing new |
| Eval cohort / observation files | Tier A2 prompt iteration | The "candidate prompt → score delta" loop | Cohort orchestration; observation tracking; multi-prompt parallel eval |
| Ordo `admin/` shell | Already borrowed in Sprint 9 | Already done; nothing new | The 11-page admin sprawl |

Cite the Ordo path in any new file that takes a pattern from there. Sprint 7-9 set this convention.

---

## 11. Single-recommendation view

If only one feature lands after Sprint 11, build **A1 (Trace inspection panel).** It is:

- The single highest-leverage feature for FDE-role storytelling.
- Bounded in scope (~2-3 days).
- Mostly a UI over data we already capture or trivially capture more of.
- TDD-friendly.
- A talking point: *"I built a debug surface that lets operators trace any AI action back to its retrieved context, system prompt, and tool I/O."* That sentence on a Distyl interview slide would land.

Everything else is optional.

---

## 12. What this doc is not

- Not a charter amendment. Charter §16 currently caps at Sprint 11. Adding Sprints 12-14 requires explicit operator approval ([agent-charter.md §14](agent-charter.md)).
- Not a commitment. Each Tier A item is a candidate; the operator decides what's worth building.
- Not exhaustive. There are easily 30 features that could be added; this doc surfaces the ones with the best **portfolio signal ÷ scope** ratio.

---

## 13. Suggested next operator decision

Three reasonable paths, in order of recommendation:

1. **Ship Sprint 11 (deploy + Loom + README polish + LICENSE + CHANGELOG). Stop.** The portfolio is done. Apply to Doing Things, Distyl, Anthropic.
2. **Ship Sprint 11, then Sprint 12 (Trace Inspection — A1).** One additional FDE-grade talking point. Adds maybe a week.
3. **Ship Sprint 11 + Sprint 12 + Sprint 13 (Prompt Iteration — A2).** Two FDE-grade talking points. Adds maybe two weeks total.

Anything beyond path 3 trades portfolio-submission time for diminishing marginal value. The FDE roles you're targeting prioritize *shipped, deployed, demonstrably-tested* work over *feature breadth*.
