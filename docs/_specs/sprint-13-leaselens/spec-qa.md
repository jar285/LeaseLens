# Sprint 13 Spec — Self-QA Pass

**Status:** Issues identified, spec updated in same session.
**Date:** 2026-05-07.
**Reviewer:** Coding agent self-pass per charter §7 step 2.
**Method:** Structured-reasoning gap-finding against the v1 spec at
`docs/_specs/sprint-13-leaselens/spec.md`. Sequential Thinking MCP not
available in this session; equivalent walkthrough done in agent
reasoning.

The pass found **6 HIGH-severity issues**, **11 MEDIUM-severity
issues**, and **3 LOW-severity items**. Fixes were applied to the spec
in this session. This document is the record of what was found, what
was changed, and why.

---

## HIGH severity (would block the sprint plan or break the demo)

### H1. `MAX_TOOL_ITERATIONS = 3` conflicts with per-clause grading

**Where:** `src/app/api/chat/route.ts:38`. The current bound is 3.
**Spec §3h workflow:** "stream the gradings (one tool call per clause)
rather than batching, so the right-pane report fills in
progressively."

A typical NJ residential lease segments into 10–15 clauses. With
`MAX_TOOL_ITERATIONS = 3`, the agent can call `extract_clauses` once
+ `grade_clause_severity` twice and is then forced to stop.
Acceptance criterion #3 ("the agent calls `extract_clauses`, then
iteratively calls `grade_clause_severity` for each non-unknown
clause") is unreachable.

**Considered options.**
- Batch grading inside one `grade_lease` tool call. Loses the
  progressive right-pane fill-in (charter §6 "no animation that does
  not communicate state" doesn't apply but the equivalent product
  argument does — the streaming fill-in is the demo's hook).
- Multi-turn flow ("continue?"). Bad UX, breaks AC #3 verbatim.
- Bump `MAX_TOOL_ITERATIONS`. One-line change, preserves tool
  architecture, preserves progressive UX.

**Decision: bump `MAX_TOOL_ITERATIONS` to 15.**

**Rationale.** The original cap was a defensive default against
runaway loops (e.g., a model getting stuck calling `search_corpus`
ten times). The real cost guard is the daily spend ceiling
(charter §11b), not per-turn iterations. At Haiku 4.5 prices each
iteration is roughly $0.0025; 15 iterations on a single user turn
is ~$0.04, well inside any reasonable per-session budget. 15 covers
a 13-clause lease (1 extract + up to 13 grades + 1 closing summary)
without forcing batching.

**Spec fix applied:**
- `§2.4` (mutating-tool atomicity invariant) unchanged.
- `§3h` workflow paragraph reworked to make the iteration cap
  explicit and to record the bump.
- `§3j` file-layout table now includes
  `src/app/api/chat/route.ts` (modify) and a matching test update.
- `agent-guidelines.md` "Anthropic SDK" section updated to record
  the new bound and the rationale (charter §6 simplicity rule —
  tighter caps belong in code that has a real reason for them).

---

### H2. §3f three-pane UI mobile behavior contradicts §7 out-of-scope

**Where:** `§3f` ("below 1024px the PDF viewer and right pane stack
vertically") vs `§7` ("no mobile-responsive layout").

These are mutually exclusive as written. A reviewer running through
the spec on a phone would either see the documented stacked layout
(in which case §7 is wrong) or a broken layout (in which case §3f
is wrong).

**Decision:** the demo target is desktop side-by-side. Below 1024px
the layout DOES stack — this is the natural Tailwind grid behavior
and costs no extra work — but is not designed, polished, or
exercised in acceptance criteria.

**Spec fix applied:**
- `§3f` rewritten: "Below 1024px the panes stack via the Tailwind
  default flex-wrap; this is incidental, not designed."
- `§7` "No mobile-responsive layout" line clarified to "No
  mobile-targeted design or polish; the natural stacked fallback
  ships unchanged."

---

### H3. Spec's §3d violates `docs/_references/` read-only rule

**Where:** `§3d` ("URLs and access dates are recorded in
`docs/_references/README.md` per the charter's §1.5 rule").

The actual `docs/_references/README.md` rule says: *"Do not modify,
create, rename, or delete any file inside `docs/_references/` or any
subdirectory of it. This rule applies during every sprint without
exception."* Adding provenance entries to `_references/README.md` —
even if "additive" — is a modification. The exception phrasing in
the spec ("appending provenance, not modifying existing reference
material") is not supported by the rule, which has no append-only
carve-out.

**Decision:** corpus provenance moves to a new file under
`docs/_meta/`, not under `docs/_references/`. New file:
`docs/_meta/corpus-sources.md`.

**Spec fix applied:**
- `§3d` revised: provenance lives in `docs/_meta/corpus-sources.md`
  (new). `docs/_references/` is left strictly read-only per its own
  rule. The new file is added to `§3j` file layout.

---

### H4. PDF persistence across page refresh unspecified

**Where:** AC #8 ("Refresh the page (no logout). The PDF, the active
lease, and the conversation history all persist.").

`react-pdf` renders from a binary or a URL. The spec stores
`leases.text_extract` (the parsed text), but not the original PDF
bytes. On page refresh:
- `text_extract` and `clauses` are reachable from the DB via
  `active_lease_id` on the conversation row.
- The original PDF binary is gone from server memory; without
  storage, the left pane has nothing to render.

**Considered options.**
- Store PDF binary in SQLite as a BLOB on `leases.pdf_bytes`. Cost:
  up to 1 MB per row × N visitors. SQLite handles it, but the demo
  workspace TTL purge would carry binaries until cleanup.
- Store PDF binary on disk under `data/lease-uploads/{lease_id}.pdf`.
  Cost: filesystem hits, but no DB bloat. Vercel deploy: serverless
  filesystem is ephemeral — files written on one invocation may not
  exist on the next. Doesn't work for the deployed demo without a
  persistent volume mount.
- Accept lose-on-refresh: viewer shows "Re-upload to view this lease
  again — your scan results are still in the chat history."

**Decision:** lose-on-refresh for v1. The chat history, gradings,
and audit log persist via SQLite; the PDF viewer re-prompts on
refresh. Document as a known limitation.

**Rationale.** Storing 1 MB binaries in SQLite for short-lived
session input violates the §5.12 invariant in spirit — it elevates
session input toward persistent state. The simpler, cheaper, and
more honest design is to keep the PDF strictly in-flight memory.

**Spec fix applied:**
- AC #8 revised: "Refresh the page. The active lease's text,
  clauses, gradings, and conversation history persist. The PDF
  viewer surfaces a re-upload prompt; the rest of the app reads the
  active lease from the DB."
- `§9` known-limitations section adds: "PDF binary is not
  persisted; viewer prompts re-upload on refresh."

---

### H5. MCP server lease-context handling unspecified

**Where:** `§2.1` invariant ("MCP server exposes the same registry
over stdio") + `mcp/contentops-server.ts` agent-guideline ("Hardcoded
sample workspace + Admin role"). The new lease tools take an optional
`lease_id` defaulting to the conversation's `active_lease_id`. The
MCP server has no conversation context.

If a Claude Desktop user calls `extract_clauses` over MCP without a
`lease_id` argument, the existing `getActiveLease(conversationId)`
helper has nothing to read.

**Decision:** the three lease tools require an explicit `lease_id`
when called via MCP. The `lease_id` is OPTIONAL when called via the
chat route (the chat resolves it from the conversation row);
REQUIRED when called via MCP (the MCP context has no conversation).

**Implementation:** the tool descriptors keep `lease_id` as an
optional parameter at the JSON-schema level. The runtime helper
`resolveLeaseId(input, ctx)` does:
- if `input.lease_id` set → use it (validate workspace match)
- else if `ctx.conversationId` set → look up
  `conversations.active_lease_id` (validate workspace match)
- else throw with a message naming the two ways to provide it

The MCP server's hardcoded `conversationId` (today: a fixed
synthetic id) carries no `active_lease_id`, so MCP callers fall
through to the throw if they don't pass `lease_id` explicitly.

**Spec fix applied:**
- `§3b` `extract_clauses` and `grade_clause_severity` schemas: keep
  `lease_id` optional at the JSON-Schema level; add a runtime
  `resolveLeaseId` helper described in §3h.
- `§3h` adds a "lease-id resolution" sub-paragraph.
- `§3j` adds `src/lib/lease/resolve-lease-id.ts` (new) and its
  test.

---

### H6. Lease ownership check for Tenant role is missing

**Where:** `§5.6` of charter v1.13 ("Tenants own their leases and
may run read-only scans plus draft outbound negotiation emails")
and the spec's tool RBAC. The `Tenant` role can call
`draft_negotiation_email` on **any** lease in the active workspace,
because the runtime check is workspace-scoped (`workspace_id`), not
ownership-scoped (`uploaded_by`).

In the single-tenant demo, this is moot — there's only one user.
But the charter language explicitly says "own their leases," which a
reviewer reading the charter would expect to be enforced.

**Decision:** add a Tenant-only ownership check inside the three
lease tools and inside the lease-fetch route handler. Reviewer and
Admin retain workspace-scoped read.

**Rule:** for `role === 'Creator'` (Tenant):
- read paths (`extract_clauses`, `grade_clause_severity`,
  `GET /api/leases/[id]`) require `lease.uploaded_by === ctx.userId`
  in addition to the workspace check.
- write path (`draft_negotiation_email`) requires the same.
- Reviewer (`Editor`) and Admin (`Admin`) bypass the ownership
  check.

**Spec fix applied:**
- `§2` adds invariant 12: "Tenant ownership check on lease read +
  write paths."
- `§3b` tool descriptions noted.
- `§3j` adds an `assertLeaseOwnership` helper file and test.
- AC #5 reworded to verify both "Tenant draws on own lease" (passes)
  and an implicit "Tenant cannot draw on a Reviewer-uploaded lease"
  (covered by an integration test, not a manual smoke step — would
  require two seeded users mid-demo, out of acceptance scope).

---

## MEDIUM severity (should fix; spec is materially better with the fix)

### M1. `src/app/api/chat/route.ts` modification missing from §3j

The MAX bump (H1) and the new `activeLease` parameter passed to
`buildSystemPrompt` (§3h) both require route-handler edits.

**Spec fix applied:** added to §3j as Modified, with a note that the
edit is two specific blocks (constant bump + `activeLease` resolve
+ system-prompt parameter).

---

### M2. `src/lib/anthropic/e2e-mock.ts` modification missing from §3j

The Playwright E2E tests (charter §10 verification) run with
`CONTENTOPS_E2E_MOCK=1`. The mock currently knows the six ContentOps
tools. After Sprint 13 the mock needs deterministic responses for
`extract_clauses`, `grade_clause_severity`, and
`draft_negotiation_email`, and must drop the responses for the two
removed tools.

**Spec fix applied:** added to §3j as Modified.

---

### M3. `playwright.config.ts` env-var rename missing from §3j

The env-var prefix rename (§2.11: `CONTENTOPS_E2E_MOCK` →
`LEASELENS_E2E_MOCK`) requires the Playwright config to update its
`webServer.env` block.

**Spec fix applied:** added to §3j as Modified. Existing E2E specs
under `tests/e2e/*.spec.ts` are also added (env-var reference
update; new lease-flow test deferred to sprint-plan-decides).

---

### M4. Hardcoded `github.com/jar285/ContentOps` in `SPEND_CEILING_MESSAGE` not addressed

**Where:** `src/app/api/chat/route.ts:34-35`.

Spec did not mention this string. After the rename it should point
at the LeaseLens repo URL (e.g.,
`github.com/jar285/leaselens` or whatever the renamed remote is).

**Spec fix applied:** added to the §3j chat-route modification entry
as a sub-bullet ("update repo URL constant"). Sprint-plan-decides
calls out the operator confirming the new repo name before the
final commit.

---

### M5. Auto-prompt mechanism after lease upload unspecified

**Where:** AC #2 says "the chat pane has an auto-prompt." The spec
does not say whether this auto-prompt is rendered by the empty
state or posted as a synthetic user message.

**Decision:** rendered by the empty state. A new
`<LeaseScanCTA leaseId={…} />` empty-state variant replaces the
existing `ChatEmptyState` when `active_lease_id` is set and there
are no messages yet. CTA copy: "Want me to scan this 14-page lease?
I'll extract clauses, grade each against NJ tenant law, and draft
negotiation emails for any red flags." Single button: "Run the
standard scan" → posts the message on the user's behalf.

**Spec fix applied:** added to §3f UI surface and §3j file-layout.
The button-driven post is preferred over an auto-running scan
because the demo guardrails (rate limit + spend ceiling) should
trip on a deliberate user action, not on page load.

---

### M6. RedFlagReport stream-subscription architecture unspecified

**Where:** `§3f` ("subscribes to the same NDJSON stream the chat
reads"). The chat surface uses `fetch` + `ReadableStream`, single
reader. Two independent subscribers do not work.

**Decision:** ChatUI is the single stream reader. It maintains the
existing `messages` state AND a new `toolEvents` state (array of
`{ tool_name, input, result, audit_id }`). `RedFlagReport` reads
`toolEvents` via React context (a new
`<ChatStreamContext.Provider>` wrapping the three-pane shell). The
right pane filters the events by tool name client-side.

**Spec fix applied:** added to §3f. New file
`src/components/chat/ChatStreamContext.tsx` added to §3j.

---

### M7. `list_documents` RBAC change

The current registry has `list_documents` as Admin-only. The spec
table at §3b lists it as `Reviewer, Admin`. This is a contract
change relative to Sprint 7.

**Decision:** revert to Admin-only. Reviewer doesn't need it; the
chat surface for a Reviewer can use `search_corpus` (ALL) for
discovery. Smaller spec change, no contract regression.

**Spec fix applied:** §3b row updated.

---

### M8. Statute citation vs `chunk_id` alignment

**Where:** `§3b` `grade_clause_severity` result has both
`statute_citation` (human-readable, e.g., "NJ Stat 46:8-21.1") and
`chunk_id` (the live retrieved chunk id). The §2.6 invariant
("citation groundedness") validates `chunk_id` only; the
human-readable `statute_citation` is unvalidated.

**Decision:** validate that the `chunk_id`'s text body contains
`statute_citation` as a substring (case-insensitive, whitespace-
collapsed). If the model emits a citation that doesn't appear in
the cited chunk, the tool throws and the agent must retry.

**Spec fix applied:** §2.6 invariant rewritten: "every
`grade_clause_severity` result is validated by (a) the cited
`chunk_id` is live in the corpus, AND (b) the
`statute_citation` substring appears in the `chunk_id`'s text."

---

### M9. Zero-clause and partial-text-layer PDF cases

**Where:** §3c upload pipeline.

If `segmentClauses(pages)` returns zero clauses (e.g., a PDF whose
text doesn't match the numbered-section regex), the upload route
currently writes a `leases` row with no `clauses` rows. Subsequent
`extract_clauses` returns an empty array, and the agent has nothing
to grade.

If some pages have text and others don't, the segmentation produces
clauses from the text-bearing pages only.

**Decision:**
- Zero-clause case: route returns 200 with `lease_id` and
  `clause_count: 0`. The chat empty state surfaces a one-line
  warning: "I couldn't auto-detect clauses in this lease — its
  formatting may not follow standard numbered sections. Try
  pasting the lease text directly, or ask me about specific
  passages." No throw; this is a degenerate but valid state.
- Partial-text-layer: classifier handles whatever it gets; missing
  pages produce no clauses; nothing is broken.

**Spec fix applied:** §3c §3 step revised to spell out the
zero-clause path. AC #2 supplemented with the warning expectation
when the seeded sample lease is replaced with a degenerate input.

---

### M10. `purgeExpiredLeases` cascade order not explicit

**Where:** §3c says lease deletion is "lazy" via
`purgeExpiredLeases`, but the function signature, call site, and
cascade order weren't fully specified. Inheriting from
`purgeExpiredWorkspaces` is implied but not stated.

**Decision:** lease purge is folded into the existing
`purgeExpiredWorkspaces` function (extending the cascade order to
include `negotiation_emails`, `clauses`, `leases` before the
existing chunks → … cascade). There is no separate
`purgeExpiredLeases` function. The lazy hook fires from
`POST /api/workspaces` and `POST /api/leases` (latter is new).

**Spec fix applied:** §3c third paragraph revised. §3e cascade
order shown explicitly. §3j removes the standalone
`purgeExpiredLeases` reference.

---

### M11. New env vars not added to env schema

**Where:** §8 risks mentions
`LEASELENS_LEASE_MAX_BYTES` and
`LEASELENS_LEASE_MAX_PAGES`, but §3j doesn't list
`src/lib/env.ts` modifications beyond the prefix rename.

**Decision:** the env schema gains two vars with the prefix rename:

| Var | Default | Min | Max |
|---|---|---|---|
| `LEASELENS_LEASE_MAX_BYTES` | 1048576 (1 MB) | 102400 (100 KB) | 5242880 (5 MB) |
| `LEASELENS_LEASE_MAX_PAGES` | 30 | 1 | 100 |

**Spec fix applied:** §3j chat-route + env entries updated.

---

## LOW severity (polish, can defer to sprint plan)

### L1. The 30-character text-layer threshold is heuristic

§3c says "every page returns ≤30 chars" triggers the no-text-layer
error. The number is a guess; some real text-layer PDFs have very
sparse pages (a chapter break with two words). 30 is reasonable but
should be marked as tunable.

**Spec fix applied:** §3c clarifies that 30 is a heuristic and
links the exact threshold to a constant in `parse-pdf.ts` so it can
be raised or lowered without spec edits.

---

### L2. `MAX_TOOL_ITERATIONS` rationale belongs in the agent guidelines

The agent-guidelines.md "Anthropic SDK" rule names the value as
"caps at 3 iterations." After H1 it caps at 15. The guideline rule
should record the new value AND the reason — to prevent a future
agent from "tightening" it back.

**Action:** updated `docs/_meta/agent-guidelines.md` in this
session.

---

### L3. Multi-workspace lease-visibility semantics implicit

The spec workspace-scopes leases (good) but doesn't state explicitly
that a Reviewer in a workspace sees ALL leases uploaded by ANY
tenant in that workspace. This matters for the legal-aid clinic
persona (intentional) but could surprise a reviewer reading only the
RBAC section.

**Spec fix applied:** §3g adds one sentence: "Reviewers see all
leases in the active workspace; Tenants see only their own."

---

## Issues considered and rejected

The following were considered during the QA pass and intentionally
NOT changed in the spec.

- **R1. Per-clause grading inside one batch tool call.** Considered
  for H1 instead of the iteration bump. Rejected because
  progressive right-pane fill-in is the demo's primary visual sell;
  losing it costs more product value than the iteration-cap fix.
- **R2. Storing PDF binaries in SQLite.** Rejected per H4 reasoning.
- **R3. Renaming `Role` union literals to `Tenant | Reviewer | Admin`.**
  Rejected — see §2.3 RBAC mapping. Schema rewrite, cookie payload
  rewrite, and three sprint's worth of test updates with zero
  portfolio value.
- **R4. Adding a `notes` column to `clauses` for reviewer
  annotations.** Considered as a Reviewer-role read+write feature.
  Rejected — out of scope per charter §6 simplicity meta-rule, no
  AC requires it, deferable.
- **R5. Bumping the lease-grading eval back to 25 cases.** Rejected
  per spec §3i — operator can override via the v1.13 changelog
  amendment if 25 is required.

---

## Overall assessment

After the fixes recorded above, the spec is internally consistent,
implementable in the 1–2 week budget the operator stated, and aligned
with charter v1.13. No remaining HIGH-severity gaps. The MEDIUM
items M5 (auto-prompt) and M6 (stream subscription) are real
architecture decisions; both are now specified concretely enough that
the sprint plan author can implement without further spec input.

**Recommendation: proceed to charter §7 step 3 (sprint plan).**
