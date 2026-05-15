# Sprint 23c — Conversation Workspace (Center Pane Redesign)

**Status:** Draft, awaiting human QA per charter §7 step 1.
**Date:** 2026-05-13.
**Branch:** `feature/ui`.
**Parent handoff:** [handoff.md](../../../handoff.md) §13 (center pane direction), §15 (composer), §16 (scan activity), §18 (copy + tone).
**Predecessors:** [sprint-23a](../sprint-23a-ui-foundation/spec.md), [sprint-23b](../sprint-23b-document-dock/spec.md).

---

## 1. Problem

The center pane is the spine of LeaseLens — every other surface (left = evidence, right = risk map) exists to ground it. Today the center pane works, but it reads as four loosely-related states stacked on top of a chat transcript, not a coherent command workspace. Three concrete weaknesses surfaced in the handoff §13 walkthrough and the previous sprint smoke walks:

1. **The empty (pre-upload) state is a marketing-style hero.** [ChatEmptyState.tsx:111-204](../../../src/components/chat/ChatEmptyState.tsx) renders an h-14 brand badge with a 4-second breathing pulse, a 36-44px serif H1, a 15px description paragraph, four full-width starter cards, a four-step "How it works" strip, and a disclaimer pill — all stacked centred with generous padding. The hero is taller than the available viewport on many laptop displays, forcing scroll on first paint. The handoff calls for a "compact premium card" that doesn't feel like a landing page.

2. **The uploaded-before-scan state is just another markdown message.** [scan-narrative.ts:94-105](../../../src/components/lease/scan-narrative.ts#L94-L105) synthesises an `intro` assistant message rendered inline as a regular `ChatMessage` with bold filename + 4 follow-up prompt pill-chips. It works but it visually competes with downstream model messages. The handoff suggests this should feel like an "uploaded lease card" — filename prominent, page/clause count visible as meta, action chips presented as a call-to-action surface rather than reply chips.

3. **The composer reads as a generic chat input.** [ChatComposer.tsx:73-130](../../../src/components/chat/ChatComposer.tsx#L73-L130) has a 38px-min textarea, a placeholder ("Ask about a lease clause, NJ tenant law, or upload a lease to start a scan…"), and a send button. The handoff §15 calls for a "refined command bar" — bigger touch target, slash-command visual hint, updated placeholder ("Ask about a clause, request a rewrite, or type / for actions…"). No actual slash-command behavior in scope; visual hint only.

This sprint introduces no behavioral changes to the streaming pipeline, scan flow, classifier, synthetic-summary suppression, or disclaimer-bold rendering. It does not touch the right pane (23d) or the left pane (23b done). All visual layer plus one small extracted component (`UploadedLeaseCard`).

---

## 2. Invariants

Cross-sprint invariants (verbatim from [sprint-23a/spec.md §2](../sprint-23a-ui-foundation/spec.md)):

1. Public component surface is frozen — paths, exported names, props signatures unchanged unless the redesign explicitly requires a new prop, and even then no renames.
2. No new runtime dependencies.
3. `useReducedMotion()` gate is non-negotiable.
4. Severity is communicated by text + icon/shape + layout, never by color alone.
5. **Disclaimer renders bold at the end of grading messages** (load-bearing in 23c — the system prompt produces `**…**` and the synthetic summary copy includes it; do not weaken).
6. **Synthetic scan-summary suppression preserved** — `isStreaming` + `modelProducedClosingReply` checks at [ChatTranscript.tsx:92-96](../../../src/components/chat/ChatTranscript.tsx#L92-L96) stay.
7. PDF focus dialog sizing preserved.
8. Verbatim citation validation in `grade_clause_severity` not weakened.
9. **Role-gated progressive disclosure preserved** — Tenant gets `ScanTimeline` + collapsed `ActivityDrawer`; Reviewer/Admin gets inline ToolCards. The routing at [ChatMessage.tsx:225-226](../../../src/components/chat/ChatMessage.tsx#L225-L226) stays.
10. Test count never decreases.
11. No legal-pipeline, corpus, classifier, tool-contract, schema, or route changes.
12. WCAG AA contrast in both color schemes; visible focus states; minimum 44×44 touch targets; respect `prefers-reduced-motion`.

Sprint-23c-specific invariants:

13. **The `scan-narrative.ts` pure-derivation contract is preserved.** `computeScanNarrative({ events, lease })` still returns `{ intro, summary }`. The intro's `source: 'intro'`, `synthetic: true`, and `followUpPrompts: SCAN_INTRO_PROMPTS` fields all stay. Only the rendering changes.
14. **`FOLLOW_UP_PROMPTS` (generic next-step chips on a real assistant message) and the chip rendering at [ChatMessage.tsx:125-142](../../../src/components/chat/ChatMessage.tsx#L125-L142) keep working.**
15. **Composer keystroke contract unchanged.** Enter sends, Shift+Enter inserts newline, lock-on-stream disables sending. `inputMode="text"`, `autoCapitalize="sentences"`, `spellCheck` all preserved.
16. **Streaming wire format untouched.** ChatUI's NDJSON reader at [ChatUI.tsx:124-240](../../../src/components/chat/ChatUI.tsx) doesn't change.

---

## 3. Design system

### 3a. Token consumers

| Token | Consumer | Usage |
|---|---|---|
| `--color-surface-elevated` (23a) | `UploadedLeaseCard` chrome | Card surface that visually elevates the synthetic intro above the chat-message baseline. |
| `--color-surface-sunken` (23a) | Action-chips region inside `UploadedLeaseCard` | Visually separates the call-to-action chips from the card body. |
| `--color-accent-*` (existing) | Composer focus ring, slash-hint kbd | No new accent values. |

No new tokens added in 23c.

### 3b. Component refactor scope

| Component | Path | Phase | What changes |
|---|---|---|---|
| `ChatEmptyState` | [src/components/chat/ChatEmptyState.tsx](../../../src/components/chat/ChatEmptyState.tsx) | 1 | Compact card: brand badge drops from h-14 to h-12; H1 from 4xl-on-sm to 3xl-on-sm (tighter); description from `max-w-md` to `max-w-sm` and `mb-10` → `mb-8`; starter cards drop padding from `p-4` to `p-3.5`. "How it works" strip and disclaimer pill preserved. Animations unchanged (sparkle pulse stays). |
| `UploadedLeaseCard` (NEW) | [src/components/lease/UploadedLeaseCard.tsx](../../../src/components/lease/UploadedLeaseCard.tsx) | 2 | New presentational component. Props: `filename`, `pageCount`, `clauseCount`, `prompts: FollowUpPrompt[]`, `onSelectPrompt: (prompt: string) => void`. Renders: brand-icon + filename (mono accent), "N pages · M clauses" meta, paragraph body, action chips on `bg-surface-sunken`. Public surface frozen, but the file is new. |
| `ChatTranscript` | [src/components/chat/ChatTranscript.tsx](../../../src/components/chat/ChatTranscript.tsx) | 2 | When merging the synthetic `intro` from `useScanNarrative`, route it to `UploadedLeaseCard` instead of a regular `ChatMessage`. The summary path is unchanged. |
| `ChatMessage` | [src/components/chat/ChatMessage.tsx](../../../src/components/chat/ChatMessage.tsx) | 2 | No prop changes. The `synthetic + source === 'intro'` routing happens in `ChatTranscript`, not here. |
| `ChatComposer` | [src/components/chat/ChatComposer.tsx](../../../src/components/chat/ChatComposer.tsx) | 3 | Bigger textarea (min-height 44 from 38), updated placeholder, slash-command hint as a `kbd` element on the right inside the wrapper (visible at idle, hidden when typing). Focus ring tightened to use the new tokens. Send button unchanged. |
| `ScanTimeline` | [src/components/lease/ScanTimeline.tsx](../../../src/components/lease/ScanTimeline.tsx) | 4 | Visual polish: tighter border on stage rows, hover state on "Show what I did" toggle, no behavior changes. |
| `ScanTimelineRow` | [src/components/lease/ScanTimelineRow.tsx](../../../src/components/lease/ScanTimelineRow.tsx) | 4 | Visual polish: stage label typography (font-weight + tracking), no logic changes. |
| `ActivityDrawer` | [src/components/chat/ActivityDrawer.tsx](../../../src/components/chat/ActivityDrawer.tsx) | 4 | Visual polish: tighter top border + label hierarchy; no role-gating change. |

### 3c. State coverage matrix (center pane)

| State | Trigger | Renders |
|---|---|---|
| Empty | no lease, no messages | `ChatEmptyState` compact card |
| Uploaded, before scan | synthetic intro present (`useScanNarrative.intro !== null`) | `UploadedLeaseCard` (in place of synthetic-intro ChatMessage) |
| Scanning (Tenant) | scan tool events streaming | `ScanTimeline` in last assistant message tool-invocations block; `ActivityDrawer` collapsed |
| Scanning (Reviewer/Admin) | scan tool events streaming | Inline `ToolCard`s |
| Completed | summary synthetic message OR substantive model reply | Synthetic `ChatMessage` with `SCAN_COMPLETE_PROMPTS` / `SCAN_PARTIAL_PROMPTS` / `SCAN_FATAL_PROMPTS`, or the model's substantive close (synthetic suppressed) |

### 3d. Acceptance walk per phase

Per-phase definitions of done live in [sprint.md](./sprint.md).

---

## 4. Acceptance criteria

Manual walk via `npm run dev` at `http://localhost:3000/`.

1. **AC #1 — Compact empty state.** Land on `/`. Brand badge is h-12 (was h-14). H1 fits at one line on a 1440px viewport without truncation. The four starter cards + how-it-works strip + disclaimer all fit above the fold on a standard 1080px-tall viewport.
2. **AC #2 — Uploaded lease card.** Upload sample lease. The synthetic intro renders as `UploadedLeaseCard`: filename (mono) on top, "2 pages · 15 clauses" meta, paragraph body, and four action chips ("Run the standard scan", "Ask about a clause", "Compare to NJ statute", "Draft a negotiation email") sitting on a sunken surface. Clicking a chip fires `onSelectPrompt`.
3. **AC #3 — Composer command-bar.** Composer textarea has min-height ≥ 44px. The placeholder is "Ask about a clause, request a rewrite, or type / for actions…". At idle (empty + unfocused), a `/` hint kbd is visible on the right inside the wrapper; when the user starts typing, the kbd hides.
4. **AC #4 — Scan timeline polish.** Run scan. Timeline rows render with the new typography; "Show what I did" toggle has a visible hover state; `ActivityDrawer` opens cleanly.
5. **AC #5 — Synthetic-summary suppression preserved.** The synthetic "Scan complete" / "scan-partial" message does NOT appear under a substantive model close. The `isStreaming` + `modelProducedClosingReply` guard still works.
6. **AC #6 — Disclaimer bold.** Run scan to completion. The disclaimer at the end of the model's grading messages renders **bold** (`**…**` resolves to `<strong>`).
7. **AC #7 — Role-gated rendering.** Switch to Reviewer/Admin. The synthetic intro still renders as `UploadedLeaseCard` (role-agnostic surface). Scan tool events render as inline `ToolCard`s (not `ScanTimeline`). Tenant gets `ScanTimeline`.
8. **AC #8 — Test sweep.** `npm test` ≥ 765/765 pass; `npm run typecheck` clean; `npm run lint` 0 errors; `npm run build` succeeds.
9. **AC #9 — Reduced motion.** DevTools → `prefers-reduced-motion: reduce`. Empty-state sparkle pulse + card stagger + composer send-button spring all suppressed. Plain DOM throughout.
10. **AC #10 — Dark mode.** Toggle dark. `UploadedLeaseCard` surface-elevated + surface-sunken flip cleanly. Composer focus ring + slash hint kbd remain legible.
11. **AC #11 — Keyboard.** Tab through composer, send button, action chips inside the uploaded lease card. Focus rings visible. Enter sends; Shift+Enter inserts newline; clicking a chip fires the prompt.

---

## 5. Out of scope

- New legal grading rules / corpus / classifier changes.
- New tool registrations or streaming wire format changes.
- **Actual slash-command behavior** — only a visual hint kbd. A future sprint can wire a command picker; out of scope here.
- Re-introducing the composer paperclip / attach button (removed in 23a; lease upload remains in left-pane dropzone).
- Mobile-responsive treatment for the center pane (desktop-optimised per handoff).
- Changes to `ScanStage` definitions / scan-stages.ts logic.
- Right pane (`RedFlagReport`) — 23d.
- Re-architecting `ChatStreamContext` or the `ToolEvent` shape.

---

## 6. Charter compliance

- **§4 invariants:** unaffected — no tool surface, RAG, audit, or streaming changes.
- **§5 hard requirements:** unaffected.
- **§5.6 RBAC:** unchanged. The role-gated rendering at `ChatMessage.tsx` lines 225-226 is preserved.
- **§6 simplicity:** the new `UploadedLeaseCard` is a small presentational component (props in, JSX out, no state). No new context, no new dependencies, no abstractions beyond what the brief calls for.
- **§7 spec-first:** this spec ships before any code edits.
- **§11b demo guardrails:** unaffected.
- **§15a Context7:** if any `motion` or `next/font` API usage changes, verify against current docs.

---

## 7. Cross-references

- Parent handoff: [handoff.md](../../../handoff.md) §13 (center pane), §15 (composer), §16 (scan activity), §18 (copy + tone), §20 (out-of-scope).
- Predecessors: [sprint-23a/spec.md](../sprint-23a-ui-foundation/spec.md), [sprint-23b/spec.md](../sprint-23b-document-dock/spec.md).
- Design-system source: [design-system/MASTER.md](../../../design-system/MASTER.md).
- Token implementation: [src/app/globals.css](../../../src/app/globals.css).
- Downstream: [sprint-23d-risk-radar/spec.md](../sprint-23d-risk-radar/spec.md).

---

**End of spec.**
