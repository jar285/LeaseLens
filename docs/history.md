# LeaseLens — Sprint History

LeaseLens is built using a structured workflow:

**Spec → QA → Sprint Plan → Implementation → QA**

Each sprint is intended to be traceable, reviewable, and tied back to a durable project artifact.

Most sprint artifacts live in:

```text
docs/_specs/
```

For the shorter, at-a-glance summary, see the **Sprint History** section in the project [`README`](../README.md).

---

## Reading Guide

This file is the long-form sprint history.

It is organized into:

1. **Numbering Notes**
2. **Phase Overview**
3. **Narrative Timeline**
4. **Detailed Sprint Log**

Use the **Phase Overview** if you want the big picture.

Use the **Detailed Sprint Log** if you need to inspect a specific sprint.

---

## Numbering Notes

Some sprint numbers require context:

- Draft Sprints **39** and **40** were renumbered to **43** and **44** so spec order would match ship order.
- Sprint **42** shipped content pages and the favicon, but did not get a dedicated `docs/_specs/` folder.
- Some early work is grouped into ranges, such as **16A / 16B** and **19–22**, instead of being split into individual rows.

---

## Phase Overview

| Phase | Sprints | Focus |
|---|---:|---|
| Foundation | 0–12 | Original ContentOps cockpit, RAG infrastructure, tools, audit, evals, and workspace shell |
| LeaseLens Pivot | 13–14 | Pivot from media-brand ContentOps to NJ residential lease review |
| Design System + Tenant UX | 15–22 | Tailwind tokens, typography, scan progress, tenant-friendly grading, PDF reading controls |
| Editorial Brand Refresh | 23a–23k | Cream-paper brand system, Source Serif 4, terracotta palette, motion presets, PDF navigation |
| Parser-First Product Pivot | 26a–28 | Parser landing/results modes, floating assistant, state split, tenant-only header, bug triage |
| FAB + Assistant Production UX | 29–38 | FAB persistence, chat surface, help popover, concierge panel, assistant context sizing |
| Public Product + Content | 41–45 | Footer, trust badges, content pages, signature motion, observability, CI, stored findings |
| PDF Evidence Layer | 46–48 | Text-layer highlighting, evidence-frame overlay, floating labels, gutter markers |
| Public Version Polish | 49 | Public `v1.0` stamp and subtle brand depth improvements |
| Backend Hardening — Public-Anon Safety | A–B* | Fail-closed public-anonymous deploy profile: server-gated roles, request/timeout guards, metered nested spend, mode separation, per-visitor identity + lease isolation (*Phases C–D pending; branch `backend/enhancement`, not yet merged) |

---

## Narrative Timeline

### 1. Foundation and Original ContentOps Cockpit

Sprints **0–12** shipped the original ContentOps cockpit.

This included the core infrastructure that later supported LeaseLens:

- Registry
- RAG
- Audit trail
- Eval harness
- Tool registry
- Streaming shell
- Workspace foundations

At this stage, the product was still framed around a media-brand workflow rather than lease review.

---

### 2. LeaseLens Pivot

Sprint **13** pivoted the corpus and tool surface to **NJ residential leases** while preserving the underlying architecture.

Sprint **14** hardened the evaluation harness with Tier 2 lease grading.

This phase changed the product direction without throwing away the foundation.

---

### 3. Design System and Tenant-Friendly UX

Sprints **15–22** built out the design system and tenant-facing experience.

Key work included:

- Tailwind v4 tokens
- `MASTER.md` design-system documentation
- Source Serif 4 typography
- Tenant-friendly conversational scan UX
- PDF reading controls
- Scan progress UI
- Lease grading scaffolding

---

### 4. Sprint 23 Editorial Refresh

The Sprint **23** series modernized the workspace pane by pane.

Sprints **23a–23f** refined the original three-pane workspace:

- Document dock
- Conversation workspace
- Risk radar
- Chat memory
- Negotiation email card
- Supporting UI primitives

Sprints **23g–23k** introduced the Open-Design-inspired editorial brand refresh:

- Cream-paper surface system
- Terracotta palette
- Source Serif 4 weight 700 + italic
- Ink-blue citation token
- Motion-preset module
- Accessible PDF page navigation
- LIVE status indicator ripple

---

### 5. Parser-First Product Pivot

Sprints **26a–26c** moved the product away from the three-pane shell and into a parser-first workflow.

The main shell changed from:

```text
WorkspaceRouterShell
```

to:

```text
ParserLandingShell → ParserResultsShell
```

The chat experience was extracted into a floating `AssistantFab` drawer.

This was the major product shift toward:

```text
Upload lease → parse clauses → show red flags → ask assistant if needed
```

---

### 6. FAB, Chat, and Assistant Hardening

Sprints **27–38** refined the floating assistant experience.

Key work included:

- FAB persistence
- Tenant-only production header
- Six-stage scan loading
- Parser/assistant state split
- Replace confirmation
- FAB production UX refactor
- Theme transition polish
- Scan hallucination prevention
- Auto-scan tool choice enforcement
- Citation grounding improvements
- Plain-English red-flag explanations
- Premium help popover
- Premium assistant concierge panel

---

### 7. Public Product, Motion, Observability, and CI

Sprints **41–45** focused on public product polish and production readiness.

Key work included:

- Landing footer
- Glass trust badges
- Static content pages
- Privacy, terms, FAQ, and sources pages
- Favicon
- Signature motion set
- Structured logger
- Correlation IDs
- Accessible error boundaries
- PII redaction guardrails
- CI workflow for lint, typecheck, tests, and build
- Playwright e2e repair to deterministic 30/30
- Chat reading stored findings through `get_lease_findings`

---

### 8. PDF Evidence Highlighting

Sprints **46–48** shipped the PDF evidence layer.

This added the core trust-building feature that connects red-flag cards to exact source text in the lease.

Key work included:

- Client-side text-layer matcher
- Inline highlighted marks
- Highlight controls
- Scanned-page fallback
- Evidence-frame overlay
- Floating concern label
- Reveal animation
- Single focus pulse
- Calmer passive tints
- Focus-dim mode
- Severity gutter markers
- Continuous-ribbon fix

This feature shipped without database or schema changes.

---

### 9. Public v1.0 Polish

Sprint **49** set the public version stamp to:

```text
v1.0
```

It also gave the masthead and hero brand badges a subtle depth lift.

Sprint **50** carried that warmth into the post-upload workspace (Mode B): the scan verdict now reads as an
outcome (a tier-tinted halo + glyph, never colour alone), the red-flag cards lift onto an elevated surface
with a warm shadow, a quiet terracotta masthead glow ties Mode B to the landing, and the one real header
contrast gap was repaired. A follow-up (S50.6) fixed the click-to-section jump: a double-scroll that fought
itself became a single smooth glide to the cited clause.

Sprint **51** is the audit-driven Mode B premium pass (a screenshot critique scored it 30/40), shipped across
six slices. The uniform red-flag wall now groups by severity with counted dividers, HIGH cards earn depth/edge
emphasis (never a fill tint), and compliant clauses roll up behind "N clauses look standard". The PDF pane's
lost-cache state became a designed recovery card instead of a bare void. The FAB lost its gradient for a flat
terracotta on the house popover shadow; the results header gained document weight + always-on metadata; the
four card pills became three (a segmented "Explain" + an accent "Draft email" + a quiet "View on page"). The
verdict's "biggest concern" is now a click target that scrolls to and pulses the clause, the em dash is gone,
the highlight controls are labeled "Highlight on PDF", and the clauses list reads as the full inventory. A
polish pass fixed the page-label contrast, lifted the masthead glow, and gave citations a credential chip.
(Deferred: a coordinated grouped-reveal stagger, and strict dark-mode FAB-label contrast.)

---

### 10. Backend Hardening — Public-Anonymous Safety (in progress)

The `backend/enhancement` branch hardens LeaseLens for public, anonymous (CloudConvert-style) use
without disturbing the portfolio demo, behind an opt-in `LEASELENS_PUBLIC_ANON_MODE` profile that
fails closed at boot and at every trust boundary (see the README → **Deployment profiles** table).
**Phase A** stopped active leaks: `switchRole` is gated server-side, requests carry body/message
size caps + provider/tool timeouts, nested Anthropic calls (grading, email drafting) are metered so
tool spend is counted, and workspace expiry now purges `tool_calls`. **Phase B** is the identity
keystone: `LEASELENS_DEMO_MODE` shrank to UI-only while the cost/rate guardrails moved to
`guardrailsEnforced()` (fixing the inversion where a production deploy ran with no guardrails), each
anonymous visitor became a real, isolated, expiring `users` row + its own workspace instead of
collapsing onto the shared seeded Tenant, and the lease routes now fail closed through a shared
`requireSessionOrAnon`. **Phases C** (real quota + hard budget ledger) and **D** (expiring anon
retention, FK constraints, PII policy, normalized error/event envelopes) are still pending; this
work is not yet merged to `main`, and the tracked GitHub issues stay open until it is.

---

## Detailed Sprint Log

### Foundation and ContentOps Cockpit

| Sprint | Scope | Status |
|---:|---|---|
| 0 | Foundation: Next.js, SQLite, Zod, Vitest | Complete |
| 1 | Homepage chat UI and streaming shell | Complete |
| 2 | Sessions, message history, and role overlay | Complete |
| 3 | Anthropic streaming and cost guardrails | Complete |
| 4 | Corpus ingestion, chunking, and embeddings | Complete |
| 5 | Hybrid RAG retrieval and grounded chat | Complete |
| 6 | AI eval harness: Tier 1 retrieval | Complete |
| 7 | Tool registry and read-only MCP tools | Complete |
| 8 | Mutating tools, audit log, rollback, and first Playwright e2e | Complete |
| 9 | Operator cockpit dashboard | Complete |
| 10 | UI polish pass | Complete |
| 11 | Workspaces and brand onboarding | Complete |
| 12 | Diagram tool with Mermaid and motion polish | Complete |

---

### LeaseLens Pivot

| Sprint | Scope | Status |
|---:|---|---|
| 13 | LeaseLens vertical pivot: NJ corpus, lease tools, and three-pane shell | Complete |
| 14 | Tier 2 lease-grading eval, cockpit two-tier display, lint cleanup, and manual-smoke template | Complete |

---

### Design System and Tenant UX

| Sprint | Scope | Status |
|---:|---|---|
| 15 | UI polish: Tailwind v4 `@theme` tokens, Geist + Source Serif 4 typography, and chat-surface refactor | Complete |
| 16A | Design-system documentation: [`design-system/MASTER.md`](../design-system/MASTER.md) | Complete |
| 16B | PDF viewer dark-mode coverage and GFM table support in chat markdown | Complete |
| 18 | Scan-progress UI and tenant-friendly grading scaffolding | Complete |
| 19–22 | Tenant-friendly conversational scan, PDF reading controls, and corpus-grounding refinements | Complete |

---

### Sprint 23 Editorial Workspace Refresh

| Sprint | Scope | Status |
|---:|---|---|
| 23a | UI foundation tokens: z-index scale, surface-elevation aliases, backdrop tokens, motion-duration normalization, and vestigial workspace-picker removal | Complete |
| 23b | Document dock: upload tray, compact reading controls, two-row dock header, focus-dialog polish, and citation hover affordance | Complete |
| 23c | Conversation workspace: compact empty state, uploaded lease card, command-bar composer, scan timeline, and activity drawer polish | Complete |
| 23d | Risk radar: `SeverityBadge`, refreshed red-flag report, skeleton card hierarchy, and example preview card | Complete |
| 23e | Chat memory: `MAX_MESSAGES` raised from 20 to 60, prior tool result preference, and verbatim draft-email rendering | Complete |
| 23f | `NegotiationEmailCard`: clipboard, fade-in, Tenant-mode email drafting route, and system-prompt refinements | Complete |
| 23g–23j | Editorial brand refresh: cream-paper + terracotta palette, Source Serif 4, NJSA anchor, version stamp, red-flag numbering, motion presets, ink-blue citation token, vellum surfaces, PDF page navigation, and fit-width clipping fix | Complete |
| 23k | `animate-ping` radar ripple on the LIVE status indicator, gated with `motion-safe:` | Complete |

---

### Parser-First Product Pivot

| Sprint | Scope | Status |
|---:|---|---|
| 26a | Parser landing mode: `LeaseHeroDropzone`, `ParserLandingShell`, and `WorkspaceRouterShell` | Complete |
| 26b | Parser results mode: `ParserResultsShell`, `ClausesList`, and `AutoScanRunner` | Complete |
| 26c | Floating `AssistantFab`: FAB context and action prompts | Complete |
| 27 | FAB persistence, tenant-only header, and six-stage scan loading | Complete |
| 28 | Bug triage: scan animation lifecycle, parser/assistant state split, results layout restructure, aria-live clear-chat announcement, and Replace confirmation gate | Complete |
| 28.15 | Styled Replace confirmation `alertdialog`, calm enter/exit motion, and gitignored autogenerated `next-env.d.ts` | Complete |

---

### FAB, Assistant, and Chat Production UX

| Sprint | Scope | Status |
|---:|---|---|
| 29 | FAB + chat assistant production UX refactor: focus management, drawer transitions, composer behavior, and accessibility polish | Complete |
| 30 | Smoother theme flip through View Transitions API with double-rAF fallback | Complete |
| 31 | Lease metadata disambiguation in the system prompt to stop the “scan already done” hallucination | Complete |
| 32 | Forced `tool_choice` on auto-scan turns with dev-only per-call diagnostic | Complete |
| 33 | FAB chat pivot: removed redundant in-chat scan timeline from auto-scan turn and added deterministic scan-complete receipt | Complete |
| 34 | Citation grounding validator: chunk-identity recovery, dash-concat recovery, markdown-aware matching, and cross-chunk matching | Complete |
| 35 | “Plain English” red-flag card action and relabeled “Explain” to “What the law says” | Complete |
| 36 | FAB assistant context sizing: compact, workspace, and expanded-reading modes | Complete |
| 37 | Premium FAB help popover | Complete |
| 38 | Premium assistant concierge panel | Complete |

---

### Public Product, Content, Motion, Observability, and CI

| Sprint | Scope | Status |
|---:|---|---|
| 41 | Landing footer and glass trust badges | Complete |
| 42 | Static content pages: privacy, terms, FAQ, sources, and favicon | Complete |
| 43 | Signature motion: Mode A→B workspace flip, list stagger, card tap-press, and verdict emphasis | Complete |
| 44 | Observability: structured logger, correlation IDs, error boundaries, PII redaction, CI gates, and repaired Playwright e2e suite | Complete |
| 45 | Chat reads stored findings through `get_lease_findings` instead of re-scanning | Complete |

---

### PDF Evidence Layer

| Sprint | Scope | Status |
|---:|---|---|
| 46 | PDF evidence highlighting: text-layer matcher, inline marks, controls, and scanned-page fallback | Complete |
| 47 | Premium highlighter refinement: evidence-frame overlay, floating label, reveal animation, and single pulse | Complete |
| 48 | Evidence-layer polish: calmer tints, focus-dim, gutter markers, and continuous-ribbon fix | Complete |

---

### Public v1.0 Polish

| Sprint | Scope | Status |
|---:|---|---|
| 49 | Public version stamp `v1.0` and masthead / hero brand-badge depth lift | Complete |
| 50 | Mode B depth: verdict moment (tier halo + glyph), elevated red-flag cards with warm shadow, masthead glow, header contrast fix, single-glide clause jump | Complete |
| 51 | Mode B premium pass: severity-grouped cards + HIGH emphasis + OK roll-up, PDF recovery card, flat FAB, document header, segmented Explain pills, verdict click-anchor, highlight label, clauses inventory, contrast/glow/citation polish | Complete |
| 52 | Assistant drawer readability (mobile-first): folded slim masthead, chat-thread overflow (⋯) menu reclaiming the toolbar strip, mobile bottom sheet with half→full snap handle, capped reading measure (~74ch) + taller desktop default | Complete |
| 53 | Self-host fonts: vendor Geist / Geist Mono / Source Serif 4 latin variable `.woff2` via `next/font/local`, removing the build-time Google CDN fetch so `next build` is deterministic offline (P0 tech-debt) | Complete |
| 54 | React-PDF render-phase warning: root-caused as a unit-test mock artifact (real react-pdf callbacks are async); aligned the mocks to fire post-render + added a regression guard. Production unchanged (P1 tech-debt) | Complete |
| 56 | Docs truth-up: recreated `docs/_architecture/architecture.md` (technical map + Current Invariants) after the `docs/_meta/` deletion; corrected the stale `CLAUDE.md` dead-shell gotcha + present-tense `LeaseLensWorkspaceShell` comments (P1 tech-debt) | Complete |

---

### Backend Hardening — Public-Anonymous Safety (branch `backend/enhancement`, in progress)

Slices carry their committed sprint tag; the sprint-tag numbering shifted mid-sprint (early slices
by plan number, `sB.14`/`sB.15` by GitHub-issue number), so each row also names the GitHub issue it
resolves. Issues stay open until the branch merges.

| Slice (commit) | Scope | GitHub issue |
|---|---|---|
| `sA.3` (fc42532) | Gate `switchRole` server-side — role switch is a demo-only affordance, rejected in production | Closes **#16** |
| `sA.7a` (1b2f7cc) | Add `tool_calls` to workspace-expiry cleanup + a coverage guard enumerating every `workspace_id` table | Advances **#20** (FK constraints `#7b` pending) |
| `sA.8` (e0edb7d) | Request guards: body/message size caps (413), per-call Anthropic timeout + per-tool timeout (408) | Closes **#21** |
| `sA.5a` (d5292a7) | Meter nested Anthropic calls (grading, email draft) through one gateway so all tool spend is counted | Advances **#18** (hard budget ledger `#5b` pending) |
| `sB.9` (5407c2b) | Separate `LEASELENS_PUBLIC_ANON_MODE` from `DEMO_MODE`; fail-closed env at boot; guardrails gated on `guardrailsEnforced()` | Closes **#22** |
| `sB.14` (ef2bb60) | Per-visitor anonymous sessions: real isolated `users` row + own expiring workspace, minted at the Edge | Closes **#14** |
| `sB.15` (3c469a6) | Lease routes fail closed via shared `requireSessionOrAnon`; per-visitor lease isolation (404 cross-workspace, 403 cross-owner) | Closes **#15** |
| `sB.5b` (052c675) | Hard budget ledger: `provider_call` reserve/commit/release in one transaction, fail-closed before the Anthropic call (closes the check-then-overspend TOCTOU) | Closes **#18** |
| `sC.17` (56abb5d) | Composite-key quota: `quota_counter` + `enforceQuota` (session / IP-subnet / route / global-daily, weighted, all-or-nothing), typed 429 + `Retry-After`; demo keeps the legacy limiter | Closes **#17** |
| `sD.12a` (5ec5ea5) | All non-streaming errors normalized onto the `{ error, code, requestId }` envelope (RFC 9457-aligned); rollback-500 / workspaces-400 PII echo closed | Advances **#25** |
| `sD.12b` (c7c8e0f) | Typed `{budget}` / widened `{quota}` NDJSON events (demo ceiling copy retired), `X-Request-Id` on stream responses, calm at-limit client dispatch | Closes **#25** |
| `sD.17ui` | `QuotaMeter` drawer indicator: quiet → draining low meter ("N questions left this hour", `role=progressbar`, announce-once crossing) → calm at-limit notice; retires the raw-amber demo banner | UI for **#17**/**#25** |
| `sD.20` | FK invariant net: `leases.workspace_id`/`uploaded_by` + `tool_calls.workspace_id` (bare — purge stays the mechanism; `actor_user_id` deliberately un-FK'd for the `mcp-server` actor); race-tolerant table-rebuild migration; purge-expired-before-resolve on read paths | Closes **#20** |
| `sD.19` | "Delete my review now": `purgeWorkspaceNow` (shared cascade with the TTL purge), `POST /api/workspaces/delete-current` (no body — own cookie workspace only, samples refused), header button + honest ConfirmDialog (non-sample only), privacy/FAQ copy stating the 24h TTL + delete right. Workspace-as-job satisfies the `lease_jobs` criteria ("or equivalent"); a dedicated job table stays the documented future evolution | Closes **#19** |
| Phase D (remaining) | PII retention policy doc | **#24** |
| Deferred | Production DB discipline (managed Postgres / Turso decision spike) | **#23** |

---

## Current Status

LeaseLens is currently at:

```text
v1.0
```

The product has moved from the original ContentOps cockpit into a tenant-facing NJ lease parser with:

- Parser-first upload flow
- Red-flag review
- PDF evidence highlighting
- Source-grounded legal-adjacent explanations
- Floating assistant support
- Public content pages
- Production observability
- CI verification
- Premium editorial visual system

---

## Maintenance Notes

When adding a new sprint:

1. Add a short entry to the correct phase.
2. Keep the row readable.
3. Avoid turning one table row into a full paragraph.
4. Put deeper implementation details in the sprint’s own `impl.md`.
5. Add a short narrative paragraph only if the sprint changes product direction.
6. Keep this file useful for humans first.
