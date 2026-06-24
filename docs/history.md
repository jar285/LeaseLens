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
