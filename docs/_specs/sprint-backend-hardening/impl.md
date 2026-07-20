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

## Known follow-ups

- `(#12)` → `(#25)` reword on the two sD.12 commit subjects before push
  (local-only; GH autolink correctness).
- Remaining issues: #19 (expiring anon job model), #20 `#7b` (FK
  constraints), #24 (PII retention policy), #23 (DB spike, deferred).
- A public-anon Playwright *project* (second webServer env) is future CI
  work; today public-mode behavior is integration-tested in vitest.
