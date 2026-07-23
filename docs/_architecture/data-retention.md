# LeaseLens — Data Retention & PII Policy

> What the system stores, for how long, who can see it, and how it dies —
> with **every statement traced to enforcing code and a pinning test**.
> When code and this document disagree, fix this document (same contract as
> [`architecture.md`](architecture.md)). This is an engineering policy
> describing mechanically enforced behavior; it is **not** a legal document
> and makes no guarantees beyond what the cited code does.
> (Sprint D.24, GitHub #24. Don Norman: users should understand what is
> stored and for how long — the user-facing half of this policy is the
> `/privacy` "Expires automatically, or delete it now" section and the FAQ
> answer, both shipped in sD.19.)

## The retention model in one paragraph

A tenant's review is **temporary by design**, with two mechanically distinct
guarantees:

1. **Expiry at 24 hours — guaranteed at the boundary.** In public-anonymous
   mode every visitor gets their own non-sample workspace whose `expires_at`
   is set 24 hours out (`WORKSPACE_TTL_SECONDS`,
   `src/lib/workspaces/constants.ts`) — the workspace **is** the anonymous
   job (issue #19's `lease_jobs` "or equivalent"; a dedicated job table
   remains a documented future evolution). From the moment it expires it is
   **unreachable**: `getActiveWorkspace` treats an expired workspace as
   absent, and every resolve path fails closed on it.
2. **Row deletion — lazy, on the next purge-triggering request.** There is
   **no cron or background job** (deliberate; production infra is issue #23,
   deferred). `purgeExpiredWorkspaces` deletes expired workspaces — children
   first, in FK-safe order — and fires on the write routes **and** on the
   read/resolve paths (chat, lease GET, SSR page — Sprint D.20), so on any
   deployment receiving traffic, deletion follows expiry promptly. On a
   zero-traffic deployment, expired (already-unreachable) rows persist until
   the next such request. Physical deletion at the exact 24-hour boundary is
   therefore **not** guaranteed; inaccessibility is.

The visitor can also skip both and end the review immediately: **"Delete my
review"** (`POST /api/workspaces/delete-current`, Sprint D.19) purges the
caller's own cookie workspace on demand, synchronously in the request. The
two **sample workspaces are immortal and cannot be deleted** — excluded from
the TTL sweep (`is_sample = 1`), refused by `purgeWorkspaceNow`, and refused
with 403 by the endpoint.

## Data inventory

Every store that holds tenant-derived data, traced. "Dies with workspace"
means: deleted by the shared cascade (`WORKSPACE_SCOPED_TABLES` +
conversations/messages, `src/lib/workspaces/cleanup.ts`) — **immediately** via
delete-now, or after the 24h expiry on the next purge-triggering request
(unreachable from expiry onward either way; see the model above). The cascade
list is mechanically guarded:
a schema-introspection test fails if any `workspace_id`-bearing table is ever
missing from it (`cleanup.test.ts`, Sprint A.7a).

| Store | Contains | Retention | Deletion path | Enforced by | Pinned by |
|---|---|---|---|---|---|
| `leases` | Full lease text extract, filename (PII: names, addresses, amounts) | Dies with workspace | TTL sweep + delete-now | `cleanup.ts`, FK net (`schema.ts`, sD.20) | `cleanup.test.ts`, `delete-current/route.integration.test.ts` |
| `clauses` | Clause text + gradings (red flags: severity, reasoning, citations) | Dies with workspace | Same | Same | Same |
| `negotiation_emails` | Generated email drafts (tenant/landlord names possible) | Dies with workspace | Same | Same | `cleanup.test.ts` (purgeWorkspaceNow cascade) |
| `conversations` + `messages` | Chat history incl. tool I/O embedded in message rows | Dies with workspace | Same | `cleanup.ts` (dedicated statements) | `cleanup.test.ts`, `delete-current/route.integration.test.ts` |
| `tool_calls` | Tool observability rows — ids, tool names, safe error **names** only (never raw messages, Sprint 44B) | Dies with workspace | Same | `cleanup.ts` (added A.7a), `tools/tool-calls.ts` | `cleanup.test.ts` tool_calls case |
| `audit_log` | **Full tool input/output JSON** — retained deliberately; see "Audit rows" below | Dies with workspace | Same | `cleanup.ts` | `cleanup.test.ts` cascade |
| `users` (anonymous rows) | Random UUID, synthesized `anon+<uuid>@anon.leaselens.local`, generic display name — **no real personal data by construction** | **No deletion path today** (honest gap; rows are pseudonymous and content-free) | — | `auth/anon-identity.ts` | `anon-identity` tests pin the synthesized shape |
| `quota_counter`, `rate_limit` | Opaque counter keys (`session:<uuid>`, `ip:<masked /24 or /64 subnet>`) + counts — no content | Rows overwritten when their window restarts; stale keys may persist | — | `db/quota.ts`, `db/rate-limit.ts`, `http/client-ip.ts` (subnet masking, never full IP) | `quota.test.ts`, `client-ip.test.ts` |
| `spend_log` | Per-day global token totals only (`date, tokens_in, tokens_out`) — no ids, no content | Indefinite (operational aggregate) | — | `db/spend.ts` | `schema.ts:43-47` (shape) |
| `provider_call` | Budget-ledger rows: token estimates/actuals + session id — no content | Indefinite (operational ledger); stale reservations swept | — | `db/budget-ledger.ts` | `budget-ledger.test.ts` |
| Browser IndexedDB (`leaselens-pdf-cache` / `pdf-binaries`) | The PDF bytes, on the visitor's own device | Until Replace / delete-now / mount-time prune | `delete(leaseId)` on Replace; `evictExcept([])` on delete-now | `lease/pdf-binary-repository.ts`, `ParserResultsShell.tsx` | `ParserResultsShell.test.tsx` |
| Cookies | Session (signed: user id, role, anonymous flag; 24h) and workspace (signed: workspace id; TTL-matched) — ids only, no content | 24h max-age | Workspace cookie cleared by delete-now; both expire | `middleware.ts`, `delete-current/route.ts` | `middleware.test.ts`, `delete-current/route.integration.test.ts` |
| Server logs (Pino) | Correlation ids, lengths, enums, safe error **names** — content is redacted by an allowlist + an `err` serializer that drops raw messages (Sprint 44B) | Log-sink retention (deployment-defined) | — | `log/logger.ts` (`REDACT_PATHS`, `serializeError`) | 44B redaction tests |
| Anthropic API | Lease/clause text **is transmitted** to Anthropic for clause extraction, grading, and chat answers (that is the product). This document states the data flow only; provider-side handling is governed by Anthropic's own terms — no claims are made here | Per-request transmission | — | `anthropic/metered-client.ts`, `tools/lease-tools.ts` | — (data flow, not retention) |
| `documents` / `chunks` | **Not tenant data** — the NJ tenant-law corpus only. Lease content is never embedded into the RAG index (architecture invariant #4) | Permanent (public corpus) | — | Seeder + RAG boundary | `schema.test.ts`, corpus tests |

## Who can see tenant content (issue #24 AC3)

- **Other visitors: no.** Per-visitor isolation is fail-closed — each
  anonymous visitor is a real, isolated `users` row + own workspace; lease
  reads are workspace-scoped and ownership-checked (404 cross-workspace, 403
  cross-owner). Enforced by `auth/resolve-session.ts` +
  `lease/assert-lease-ownership.ts`; pinned by the sB.15 isolation tests and
  live-verified (sprint screenshots 01–04).
- **Operators via the cockpit: not in production.** `/cockpit` redirects any
  Tenant-role visitor (`app/cockpit/page.tsx`), and in public-anonymous mode
  **only Tenant cookies can exist**: middleware mints Tenant-only anonymous
  sessions, and `switchRole` — the sole role-escalation path — is
  server-gated to the demo profile (Sprint A.3, `auth/actions.ts`, pinned by
  `auth/actions.test.ts`). The protection is a **transitive chain**; the
  chain's links are individually test-pinned. Cockpit server actions carry
  their own role check independent of the page redirect.
- **Direct database access:** whoever operates the deployment can read the
  SQLite file. That is outside application enforcement and is stated here
  rather than guaranteed away. Mitigations are the 24h TTL itself and #23
  (production DB discipline — deferred).

## Audit rows (issue #24 AC4 — decided, not built)

`audit_log` carries three JSON columns with distinct jobs. **Rollback
technically requires only `compensating_action_json`** — the rollback route
parses exactly that column into the tool's `compensatingAction`
(`audit/[id]/rollback/route.ts`); redacting it would break Undo. The **full
`input_json`/`output_json`** are *not* consumed by rollback: they serve the
cockpit's audit panel, auditability ("what exactly did the AI do?"), and
observability. Retaining them is a **decision, not a technical requirement**
— summarizing them would keep the PII anyway, and their mitigation is
retention, not redaction: every audit row is workspace-scoped and dies with
its workspace (on delete-now, or after expiry per the lazy-purge model
above). Log-stream and tool-error surfaces were already redacted in Sprint
44B (safe error names, never raw messages). **Further audit-row redaction is
a documented non-goal.**

## Export (issue #24 AC2 — decided, not built)

Deletion exists (sD.19). An **export path is a documented non-goal**: the
review is ephemeral by design (expires at 24h), the authoritative source document is
the tenant's own PDF (which they already possess, and which the browser cache
serves back to them during the session), and building an export channel for
data whose entire safety model is "it disappears" would work against honest
temporary storage (Dieter Rams). If reviews ever become durable accounts,
export must be revisited alongside that change.

## Limitations (stated honestly)

- **TTL deletion is lazy, not clock-scheduled.** There is no cron or
  background job; expired rows are deleted on the next purge-triggering
  request (write routes + read/resolve paths). Expiry makes them unreachable
  at the 24h boundary regardless; physical deletion on a zero-traffic
  deployment waits for the next request. (Scheduling infra belongs to #23,
  deferred.)
- **SQL `DELETE` is not forensic erasure.** SQLite may retain deleted-row
  images in freed pages and the WAL until checkpoint/`VACUUM`. The
  application deletes rows; it does not scrub disk sectors.
- **Backups/snapshots** of the database file, and log-sink retention, are
  deployment-operator territory — outside application enforcement.
- **Anonymous `users` rows persist** (see inventory). They contain no real
  personal data by construction, but a deletion/aging path is a reasonable
  future hardening.

## Verification map (issue #24 AC5)

| Behavior | Test |
|---|---|
| Every `workspace_id` table is covered by the purge cascade (mechanical guard) | `src/lib/workspaces/cleanup.test.ts` — schema-introspection coverage test (A.7a) |
| TTL purge cascades leases/clauses/emails/audit/tool_calls/conversations/messages; never samples | `cleanup.test.ts` cascade + never-purges-sample tests |
| On-demand deletion by id; samples refused; FK-safe order | `cleanup.test.ts` `purgeWorkspaceNow` block (sD.19) |
| Delete-now endpoint: 401 fail-closed / 403 sample / 200 + children gone + cookie cleared | `src/app/api/workspaces/delete-current/route.integration.test.ts` |
| Client PDF cache evicted on Replace and on delete-now (`evictExcept([])`) | `src/components/lease/ParserResultsShell.test.tsx` |
| Purge fires on read/resolve paths (expired children deleted, not hidden) | `src/lib/auth/resolve-session.test.ts` purge-on-resolve test (sD.20) |
| Role escalation impossible outside demo (the cockpit chain's load-bearing link) | `src/lib/auth/actions.test.ts` (sA.3) |
| Cross-visitor isolation (404/403) | `src/app/api/leases/[id]/route.integration.test.ts` (sB.15) |

## Maintenance

Adding any new table with a `workspace_id` column fails the A.7a coverage
test until it joins the purge cascade — update this document's inventory in
the same change. New stores that hold tenant content but are *not*
workspace-scoped (like the counters above) must be added to the inventory
with an explicit retention statement.
