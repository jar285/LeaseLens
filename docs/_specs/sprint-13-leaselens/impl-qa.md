# Sprint 13/14 — implementation QA: acceptance criteria walk-through

This document captures the AC #1–13 manual-smoke pass against a fresh
`npm run db:seed && npm run dev`. AC #14–15 (README + Loom) are
deferred to Sprint 16 alongside the Vercel deploy.

For each AC, this document records:

- **Code-level verification** — the file(s) / test(s) that demonstrate
  the behaviour is wired in production code. Done by the agent during
  Sprint 14 Phase 14 from desk-side reading, not from clicking through
  the UI.
- **Manual** — operator-driven check. The operator fills in the
  `Result` column after walking through the running app.

A `⚠️ Gap` row flags a documented partial implementation where the AC
language describes more than the codebase currently ships. Each gap
links to the Sprint 15 polish item that closes it.

## Pre-flight

```bash
rm data/leaselens.db && npm run db:seed
npm run dev
# open http://localhost:3000 in a browser with DevTools open
```

The fresh seed produces:
- 28 NJ tenant-law markdown files → 166 chunks (verify with
  `sqlite3 data/leaselens.db "SELECT COUNT(*) FROM chunks"`)
- 1 sample lease at `SAMPLE_LEASE_ID = 00000000-0000-0000-0000-000000000020`
  (15 clauses, planted issues per
  [src/corpus/sample-lease/sample-nj-residential-lease.md](../../../src/corpus/sample-lease/sample-nj-residential-lease.md))

## AC #1 — Empty state: header + two paths + disclaimer

**Code-level:** ✅ Header rendered in [src/app/page.tsx](../../../src/app/page.tsx).
Logo + workspace name + (cockpit link if not Creator) + role switcher
(Phase 10.8). Browser tab title is "LeaseLens — NJ Tenant Lease
Red-Flag Reviewer" per [src/app/layout.tsx](../../../src/app/layout.tsx).
Disclaimer is included in the system prompt verbatim per
[src/lib/lease/disclaimer.ts](../../../src/lib/lease/disclaimer.ts).

**⚠️ Gap:** the spec language calls for *two* explicit paths in the
empty state ("Use sample lease" and "Upload your NJ lease"). The
current empty state only shows the upload dropzone; there is no
"Use sample lease" button. Sprint 15 polish item: add a one-click
"Use sample lease" affordance that points the conversation at
`SAMPLE_LEASE_ID` (already seeded; no upload required).

**Manual:** [ ] Header reads "LeaseLens" · [ ] Upload dropzone
visible · [ ] Empty state mentions disclaimer or it appears in the
chat reply

## AC #2 — Sample-lease path

**⚠️ Gap (same as AC #1):** there is no "Use sample lease" button.
The seeded sample lease exists in the DB but the UI does not surface
a one-click loader. The seeded lease is reachable via the chat tools
once a conversation exists (extract_clauses can resolve it via the
recent-upload fallback only when the user actually uploads), so for
the demo flow the sample is exercised by uploading
`src/corpus/sample-lease/sample-nj-residential-lease.pdf` directly.

**Manual:** N/A (deferred to Sprint 15)

## AC #3 — "Run the standard scan" → extract_clauses + per-clause grading

**Code-level:** ✅ Tools wired in [src/lib/tools/lease-tools.ts](../../../src/lib/tools/lease-tools.ts).
System prompt prescribes call order in
[src/lib/chat/system-prompt.ts](../../../src/lib/chat/system-prompt.ts).
Streaming + tool dispatch in
[src/app/api/chat/route.ts](../../../src/app/api/chat/route.ts) (MAX_TOOL_ITERATIONS=15).
Right-pane card streaming verified by
[RedFlagReport.test.tsx](../../../src/components/lease/RedFlagReport.test.tsx).
Operator already validated this end-to-end earlier in this session
(the screenshots showed 15 graded clauses streaming into the right pane).

**Manual:** [ ] Upload sample PDF · [ ] Send "Run the standard scan
on my active lease" · [ ] Cards stream in (severity + citation +
reasoning) · [ ] All ~15 clauses surface a card

## AC #4 — Citation chip click scrolls PDF + chunk_id grounded

**Code-level:** ✅ Active-clause highlight (Phase 10.8) wired via
[ChatStreamContext](../../../src/components/chat/ChatStreamContext.tsx)
`activeClauseId` + `pdfViewerRef.scrollToPage`. Chunk_id grounding
enforced by `validateGrading` in
[lease-tools.ts](../../../src/lib/tools/lease-tools.ts) — verified
by the [groundedness Tier 2 metric](../../../src/lib/evals/lease-grading-runner.ts).

**Manual:** [ ] Click "View on page N" on a high-severity card ·
[ ] PDF auto-scrolls · [ ] Page block + card both ring indigo for
~4s · [ ] Sticky callout at top of PDF reads `Clause §N · …`

## AC #5 — Draft negotiation email + Undo → audit row rolled-back

**Code-level:** ✅ `draft_negotiation_email` mutating tool in
[lease-tools.ts](../../../src/lib/tools/lease-tools.ts) — uses the
`prepare` step (Phase 10.8) so the LLM call runs before the sync
DB transaction. Audit + rollback wired through the existing
[src/lib/audit/](../../../src/lib/audit/) helpers (Sprint 8).
Tenant-ownership enforcement covered by
[lease-tools.test.ts](../../../src/lib/tools/lease-tools.test.ts)
("throws in prepare when Tenant tries to draft for a lease they
did not upload"). Undo path covered by
[lease-tools.test.ts](../../../src/lib/tools/lease-tools.test.ts)
("compensatingAction deletes the negotiation_emails row").

**Manual:** [ ] Send "Draft a polite negotiation email for the
security-deposit clause" · [ ] Email drafts in chat with proper
template (`Hi [Landlord Name],` … `Best, [Your Name]`) · [ ] ToolCard
shows Undo button · [ ] Click Undo · [ ] `sqlite3 data/leaselens.db
"SELECT id, status FROM audit_log ORDER BY created_at DESC LIMIT 1"`
shows `rolled_back`

## AC #6 — Role switch + cockpit eval-health

**Code-level:** ✅ Role switcher relocated to header in Phase 10.8
([RoleSwitcher.tsx](../../../src/components/auth/RoleSwitcher.tsx)).
Cockpit page restricted to Editor + Admin via session check in
[src/app/cockpit/page.tsx](../../../src/app/cockpit/page.tsx).
Eval-health panel (Phase 12 — this sprint) renders Tier 1 + Tier 2
in [EvalHealthPanel.tsx](../../../src/components/cockpit/EvalHealthPanel.tsx).

**⚠️ Gap:** the spec language mentions "a Tier 2 button that runs a
one-case eval on demand (cost guardrails permitting)". The current
cockpit panel renders the LATEST Tier 2 report but does not have an
in-app button to TRIGGER a new run. Tier 2 is operator-only via
`npm run eval:leases` (real Anthropic, ~$0.10–0.50). Sprint 15 polish
item: add a `<RunTier2Button>` gated by `isSpendCeilingExceeded()`.

**Manual:** [ ] Click Reviewer/Admin in role switcher · [ ] Cockpit
link appears in header · [ ] Open `/cockpit` · [ ] Audit panel lists
your recent draft + rollback (if AC #5 done) · [ ] Eval-health panel
shows Tier 1 (10/12 from baseline-sprint-14.json) · [ ] Tier 2 shows
empty state OR the most recent run if you've executed `npm run
eval:leases`

## AC #7 — Mermaid severity heatmap

**Code-level:** ✅ `render_workflow_diagram` tool from Sprint 12,
preserved through the rename. Mermaid component in
[MermaidDiagram.tsx](../../../src/components/chat/MermaidDiagram.tsx)
(motion fade-in preserved). Tool registered in
[create-registry.ts](../../../src/lib/tools/create-registry.ts).

**Manual:** [ ] Send "Show me the severity heatmap" · [ ] Mermaid
diagram renders inline in the chat with a fade-in · [ ] Nodes are
color-coded by severity (high = red-tinted, etc.)

## AC #8 — Refresh persists state; PDF re-upload prompt

**Code-level:** ✅ SQLite-backed conversations + messages persist
via [src/lib/db/](../../../src/lib/db/). Lease + clauses + gradings
live in DB rows. PDF binary intentionally NOT persisted (Spec §9) —
[LeaseLensWorkspaceShell.tsx](../../../src/components/lease/LeaseLensWorkspaceShell.tsx)
holds the Blob URL only in React state, lost on refresh.

**Manual:** [ ] Run a scan in a fresh conversation · [ ] Refresh
the page · [ ] Chat history persists (visible in transcript) ·
[ ] Left pane shows the upload dropzone (PDF gone) · [ ] Send a
follow-up — agent still has access to the lease via
`active_lease_id` (works because Phase 10.8.2 active-lease awareness
threads it into the system prompt)

## AC #9 — Arbitrary text-layer NJ lease upload

**Code-level:** ✅ Upload route
[src/app/api/leases/route.ts](../../../src/app/api/leases/route.ts)
accepts any `application/pdf` under `LEASELENS_LEASE_MAX_BYTES`. Path
is fully dynamic — see the audit in
[the operator's earlier verification](.) (no hardcoded sample-specific
values, confirmed by grep audit during the session).

**Manual:** [ ] Find any NJ residential lease PDF (e.g., a friend's
lease, public NJ template) · [ ] Upload via dropzone · [ ] Run scan ·
[ ] Cards reflect the uploaded lease's actual clauses, not the
sample's

## AC #10 — Scanned-image PDF returns 422 + fallback message

**Code-level:** ✅ Upload route checks `parsed.pages.every((p) =>
p.text.trim().length < MIN_PAGE_TEXT_CHARS)` and returns
`{ error, code: 'pdf_no_text_layer' }` with status 422
([leases/route.ts](../../../src/app/api/leases/route.ts)).

**⚠️ Gap:** the spec language says "the UI shows the paste-text
fallback and an explanatory message." The route returns a clear
error message but the UI surface is the same dropzone in `error`
state — there is NO paste-text textarea fallback rendered. Sprint 15
polish item: when the upload error code is `pdf_no_text_layer`, swap
the dropzone for a `<textarea>` accepting raw lease text + a "Use
this text" button that posts to a future text-only ingest path.

**Manual:** [ ] Find a scanned-image PDF (any image-only PDF works) ·
[ ] Upload it · [ ] Dropzone shows the error in red with "PDF text
layer is empty or unreadable" · [ ] (Sprint 15) paste-text fallback

## AC #11 — PDF > 1 MB returns 413

**Code-level:** ✅ Upload route's `validateLeaseUpload()` checks
`file.size > LEASELENS_LEASE_MAX_BYTES` (default 1 MB / 1,048,576
bytes per `.env.example`) and the route returns 413 for that branch
of the validation error
([leases/route.ts](../../../src/app/api/leases/route.ts)).

**Manual:** [ ] Find or generate a >1 MB PDF · [ ] Upload it ·
[ ] Dropzone shows the size-limit error message

## AC #12 — Rate-limit (10 chat requests / hour) preserved

**Code-level:** ✅ `checkAndIncrementRateLimit` guard in
[chat/route.ts](../../../src/app/api/chat/route.ts) (Sprint 3 behavior
preserved, untouched by Sprint 13/14). Returns 429 when exceeded.
Same guard fires in
[leases/route.ts](../../../src/app/api/leases/route.ts) for uploads.

**Manual:** [ ] Send 11 chat messages in quick succession · [ ] The
11th returns the rate-limit message · [ ] Cockpit's audit panel
reflects the count

## AC #13 — Spend-ceiling message on the chat surface

**Code-level:** ✅ `isSpendCeilingExceeded()` check in
[chat/route.ts:185](../../../src/app/api/chat/route.ts) — when the
daily spend exceeds `LEASELENS_DAILY_SPEND_CEILING_USD` (default $2),
the route streams `SPEND_CEILING_MESSAGE` back to the chat. Message
points at `github.com/jar285/leaselens` for unlimited local use.

**Manual:** [ ] Edit `.env.local` to set
`LEASELENS_DAILY_SPEND_CEILING_USD=0.001` (or run real chats until
$2 is exceeded) · [ ] Send a chat message · [ ] Spend-ceiling message
appears in the chat stream

## AC #14, #15 — Deferred

Deferred to Sprint 16 (deploy + Loom). README rewrite is in Phase 16
of Sprint 14; the architecture diagram + Loom embed land in Sprint
16.

---

## Summary

| AC | Code-level | Manual | Notes |
|---|---|---|---|
| #1 | ✅ | [ ] | ⚠️ Gap: no "Use sample lease" button |
| #2 | ⚠️ | N/A | ⚠️ Gap: deferred to Sprint 15 |
| #3 | ✅ | [ ] | Operator already validated end-to-end |
| #4 | ✅ | [ ] | Phase 10.8 active-clause highlight wired |
| #5 | ✅ | [ ] | Audit + rollback covered by integration tests |
| #6 | ✅ | [ ] | ⚠️ Gap: no in-app "Run Tier 2" button (Sprint 15) |
| #7 | ✅ | [ ] | Sprint 12 Mermaid tool preserved |
| #8 | ✅ | [ ] | Phase 10.8.2 system-prompt awareness covers re-bind |
| #9 | ✅ | [ ] | Upload path is fully dynamic |
| #10 | ✅ | [ ] | ⚠️ Gap: no paste-text fallback UI (Sprint 15) |
| #11 | ✅ | [ ] | |
| #12 | ✅ | [ ] | Sprint 3 behavior preserved |
| #13 | ✅ | [ ] | Sprint 3 behavior preserved |
| #14, #15 | — | — | Deferred to Sprint 16 |

### Sprint 15 polish backlog (from gaps above)

1. **"Use sample lease" empty-state button** — points the conversation
   at `SAMPLE_LEASE_ID`. Closes AC #1 + #2 gap.
2. **In-app "Run Tier 2 (one case)" button** on cockpit eval-health
   panel, gated by `isSpendCeilingExceeded()`. Closes AC #6 gap.
3. **Paste-text fallback** when upload returns
   `code: 'pdf_no_text_layer'`. Swaps dropzone for textarea +
   "Use this text" button hitting a new text-only ingest path.
   Closes AC #10 gap.

### How to record manual-walk results

After running through the manual checks above, edit this file in
place and replace each `[ ]` with `[x]` for items that pass, `[!]`
for items that fail (with a one-line note), or leave `[ ]` for
items skipped this round. Commit the result so the document tracks
which build was verified.
