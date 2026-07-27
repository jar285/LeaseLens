# Backend Hardening — Public-Anonymous Safety Sprint · impl / QA note

Branch `backend/enhancement`. Phases `sA` → `sD`. Tracks GitHub issues #14–#25
(mapping + per-slice detail in [`docs/history.md`](../../history.md) → *Backend
Hardening* table; architecture invariant #9 in
[`docs/_architecture/architecture.md`](../../_architecture/architecture.md)).

## What changed (one paragraph)

The app is now safe to run as a public anonymous tool behind the opt-in
`LEASELENS_PUBLIC_ANON_MODE` profile, while the portfolio demo stays the
default deploy. Identity: every visitor is a real, isolated, expiring `users`
row + own non-sample workspace (#14), lease routes fail closed through one
shared `requireSessionOrAnon` (#15), and `switchRole` is a demo-only
affordance (#16). Cost/abuse: requests carry size caps + provider/tool
timeouts (#21), all Anthropic calls flow through a metered gateway into a
reserve/commit/release budget ledger that fails closed before overspending
(#18), and a weighted composite-key quota (session / IP-subnet / route /
global-daily) enforces per-visitor limits with typed 429 + `Retry-After`
(#17). Contracts: every JSON error speaks the `{ error, code, requestId }`
envelope (RFC 9457-aligned; two `err.message` PII echoes closed) and the
stream emits typed `budget`/`quota` events with `X-Request-Id` (#25). UI: the
assistant drawer carries the three-state `QuotaMeter` (quiet → draining
"N questions left this hour" meter with announce-once crossing → calm
at-limit notice naming what still works). Guardrails gate on
`guardrailsEnforced()` = public-anon OR demo (#22) — never `DEMO_MODE` alone.

## Verification

- **Gates** (every slice, red test → green → refactor): `npm run lint` clean ·
  `npm run typecheck` clean · `npx vitest run` **1492 pass / 169 files**
  (baseline 1426 at sprint start) · `npm run build` compiled (server-free
  windows; also CI). E2E: `tests/e2e/quota-indicator.spec.ts` covers the
  indicator's three states against the demo-mode e2e server; public-anon-only
  behavior (per-visitor isolation, composite tiers, ledger concurrency) is
  pinned by vitest integration suites.
- **Live drives** (Playwright MCP, public-anon dev server, deterministic
  `LEASELENS_E2E_MOCK=1`, DB restored to baseline after): per-visitor
  isolation (cookieless 401 / owner 200 / cross-visitor 404), ledger
  reserve→commit with zero leaked reservations, over-ceiling refusal, quota
  429 + `Retry-After`, and all three indicator states.

## Screenshots (`./screenshots/`)

| File | Shows |
|---|---|
| `01-landing-public-anon.png` | Public-anon landing: tenant-only UI, no role switcher/cockpit |
| `02-assistant-drawer.png` | FAB drawer before the indicator existed (placement context) |
| `03-quota-low-banner.png` | **Before:** raw-amber "Demo quota" banner (off-brand, no aria-live) |
| `04-quota-exhausted-429.png` | **Before:** 429 rendered as the red "Failed to generate response" |
| `05-quota-meter-low.png` | **After:** QuotaMeter low state — "19 questions left this hour" + draining bar (19/60) |
| `06-quota-rate-limit-calm.png` | **After:** 429 → calm "question limit… resets within the hour" notice |
| `07-quota-daily-paused.png` | **After:** typed daily budget event → "paused for today" notice |
| `08-delete-review-button.png` | sD.19: "Delete my review" beside Replace (non-sample workspaces only) |
| `09-delete-confirm-dialog.png` | sD.19: honest destructive confirm ("permanently deletes … from our server") |
| `10-post-delete-mode-a.png` | sD.19: post-delete — back to Mode A, cookie cleared, server rows verified gone |
| `11-delete-then-reupload-200.png` | sD.19b: delete → second upload succeeds (network: `delete-current` 200, then `POST /api/leases` **200**, previously 401) |
| `12-header-44px-touch-targets.png` | sD.19c: header Delete/Replace at the 44px floor (live boxes: 137×44 / 86×44) |

## Known follow-ups

- ~~`(#12)` → `(#25)` reword~~ done (commits rebuilt content-identical).
- ~~#20 `#7b` FK constraints~~ done (`sD.20`): FK net on leases/tool_calls,
  race-tolerant rebuild migration (live-verified on the dev DB: 768 leases +
  11 tool_calls preserved, 0 legacy orphans per `PRAGMA foreign_key_check`),
  purge-expired-before-resolve on the chat/leases-GET/SSR read paths.
- ~~#19 delete-review-now~~ done (`sD.19`): `purgeWorkspaceNow` + the
  no-body `delete-current` endpoint + header affordance + honest privacy/FAQ
  retention copy; live-verified end-to-end (200 → Mode A → cookie cleared →
  rows gone). Workspace-as-job satisfies the `lease_jobs` criteria; a
  dedicated job table remains the documented future evolution.
- ~~#24 retention policy~~ done (`sD.24`):
  [`docs/_architecture/data-retention.md`](../../_architecture/data-retention.md)
  — store inventory with per-row code+test tracing; AC2-export + AC4-further-
  redaction closed as reasoned non-goals; AC5's deletion tests were delivered
  by sA.7a/sD.19/sD.20 (see the doc's verification map).
- ~~sD.19 review findings~~ done (`sD.19b` + `sD.19c`). **QA note:** the
  sD.24 review pause surfaced two sD.19 defects. (1) sD.19b — after "Delete
  my review" the very next upload 401'd in public mode: the route cleared the
  workspace cookie assuming middleware would re-mint on the next navigation,
  but the Mode B→A flip is pure client state and `/api/leases` is not a
  middleware minting route, so `requireSessionOrAnon` failed closed. Fix: the
  200 response now rotates the cookie to a fresh, empty, non-sample workspace
  id (middleware parity; demo still clears and falls back to the sample).
  TDD: new integration test decodes the rotated cookie and runs it through
  the exact upload auth gate (watched red on the old route, green after);
  live-verified in `npm run dev` under `LEASELENS_PUBLIC_ANON_MODE=true` —
  upload 200 → delete 200 → **second upload 200** with no navigation
  (screenshot 11). (2) sD.19c — the header Delete/Replace pair shipped at
  ~26px, under the house 44px touch-target floor; both siblings now carry the
  canonical `min-h-11` (component test watched red→green; live boxes measure
  44px tall — screenshot 12). Full suite, lint, typecheck, and build re-run
  green after both fixes.
- Remaining: #23 (DB spike) stays deferred — the sprint's only open issue.
- A public-anon Playwright *project* (second webServer env) is future CI
  work; today public-mode behavior is integration-tested in vitest.
