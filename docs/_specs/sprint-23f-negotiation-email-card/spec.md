# Sprint 23f — NegotiationEmailCard (Tenant-Mode Email Surface)

**Status:** Draft, awaiting human QA per charter §7 step 1.
**Date:** 2026-05-13.
**Branch:** `feature/ui`.
**Predecessors:** [sprint-23a](../sprint-23a-ui-foundation/spec.md), [sprint-23b](../sprint-23b-document-dock/spec.md), [sprint-23c](../sprint-23c-conversation-workspace/spec.md), [sprint-23d](../sprint-23d-risk-radar/spec.md), [sprint-23e](../sprint-23e-chat-memory/spec.md) (all committed).
**Origin:** Bug surfaced during the sprint-23e smoke walk. The system-prompt rendering fix (s23e.3) is the safety net; this sprint ships the proper UX.

---

## 1. Problem

When the model fires `draft_negotiation_email` × N to produce one polished email per high-severity clause, the user today sees **N collapsed `draft_negotiation_email` "Done" rows** in the chat. Expanding a row reveals raw JSON (`email_id`, `clause_id`, `tone`, `subject`, `body`). The carefully-drafted email is buried inside a debugging surface.

Sprint-23e's prompt-rendering fix (s23e.3) instructs the model to ALSO render each email's `subject` + `body` verbatim in its assistant text. That's the safety net — text on the page that the user can read. But it leaves three problems unsolved:

1. **No tenant affordance for copying the email.** Markdown text can be selected, but the user has to manually drag-select a multi-paragraph body and copy. A dedicated card surface gives them a one-click "Copy email" button.
2. **No severity context on the email.** The model's text rendering doesn't carry the severity badge or clause label naturally. The tenant has to infer "this is the high-severity security-deposit clause" from the email's content.
3. **The tool-result data is still in the tool stream — wasted.** The structured `subject`/`body` are sitting in `useChatStream().toolEvents`. Re-rendering them as cards is essentially free; routing them through a presentational component instead of the generic `ToolCard` is the right product surface.

This sprint introduces a `NegotiationEmailCard` component that — in Tenant mode — replaces the generic `ToolCard` JSON view for `draft_negotiation_email` tool_results with a real email card: clause label + severity badge + subject + body + Copy button. Reviewer/Admin keeps the existing `ToolCard` JSON view (trace fidelity).

---

## 2. Invariants

Cross-sprint invariants (verbatim from [sprint-23a/spec.md §2](../sprint-23a-ui-foundation/spec.md)):

1. Public component surface is frozen — paths, exported names, props signatures unchanged unless the redesign explicitly requires a new prop.
2. No new runtime dependencies. The clipboard interaction uses the browser-native `navigator.clipboard.writeText()` API.
3. `useReducedMotion()` gate is non-negotiable.
4. Severity is communicated by text + icon/shape + layout, never by color alone — the card reuses the `SeverityBadge` primitive from sprint-23d.
5. Disclaimer renders bold at the end of grading messages (system-prompt-driven; untouched).
6. Synthetic scan-summary suppression preserved.
7. PDF focus dialog sizing preserved.
8. Verbatim citation validation in `grade_clause_severity` not weakened.
9. **Role-gated progressive disclosure preserved** — load-bearing here. Tenant gets `NegotiationEmailCard`; Reviewer/Admin keeps the inline `ToolCard` JSON view.
10. Test count never decreases.
11. No legal-pipeline, corpus, classifier, tool-contract, schema, or route changes. The `draft_negotiation_email` tool itself ([src/lib/tools/lease-tools.ts:361-450](../../../src/lib/tools/lease-tools.ts#L361-L450)) is not touched.
12. WCAG AA contrast in both color schemes; visible focus states; 44×44 touch targets; respect `prefers-reduced-motion`.

Sprint-23f-specific invariants:

13. **The prompt-side verbatim rendering from s23e.3 stays.** Even with the new card, the model still renders each email's `## Email N: {clause label}` + `**Subject:** …` + body in its assistant text. The card is a *visual* enhancement; the text is a screen-reader-friendly fallback and a paste-target when the user prefers selecting text.
14. **The tool-result shape is unchanged.** The card reads `email_id`, `clause_id`, `tone`, `subject`, `body` from the existing tool_result. No tool contract change.
15. **The card looks up severity + clause label from prior `grade_clause_severity` tool_results in `useChatStream().toolEvents`**, matched by `clause_id`. If the matching grading is not in the event stream (edge case — should not happen in practice), the card falls back gracefully (no severity badge, generic "Clause" label).
16. **The clipboard interaction is feature-detected.** If `navigator.clipboard` is unavailable (older browsers, insecure context), the Copy button is rendered disabled with a tooltip rather than throwing.
17. **AnimatePresence + entry animation match the established 350ms ease-out-soft pattern** (same shape as the s23c.5 `UploadedLeaseCard` fade-in).

---

## 3. Design system

### 3a. Token consumers

| Token | Surface | Usage |
|---|---|---|
| `--color-surface-elevated` (23a) | Card body | Same elevation as `UploadedLeaseCard` and `PdfFocusDialog` header |
| `--color-surface-sunken` (23a) | Footer band (Copy button row) | Visually separates the action surface from the email body |
| `SeverityBadge` (23d) | Card header | Reuses the primitive; no new badge variant |
| `--duration-350` + `ease-out-soft` (23a/Sprint 15) | Entry animation | Same shape as `UploadedLeaseCard` |

No new tokens. No new lucide icons (the Copy button uses `lucide-react`'s existing `Copy` / `Check` icons).

### 3b. Component refactor scope

| Component | Path | Phase | What changes |
|---|---|---|---|
| `NegotiationEmailCard` (NEW) | [src/components/lease/NegotiationEmailCard.tsx](../../../src/components/lease/NegotiationEmailCard.tsx) | 1 | New presentational component. Props: `clauseLabel`, `severity?`, `subject`, `body`, `emailId?`. Renders: header (clause label + severity badge) + subject + body (preserve line breaks) + footer (Copy button). Pure presentation; clipboard interaction lives in the component but the state is internal. |
| `NegotiationEmailCard.test.tsx` (NEW) | [src/components/lease/NegotiationEmailCard.test.tsx](../../../src/components/lease/NegotiationEmailCard.test.tsx) | 1 | New test file: renders subject + body verbatim; renders SeverityBadge when severity given; omits severity badge cleanly when absent; Copy button writes the body to clipboard; "Copied" feedback shown briefly. |
| `ChatMessage` (routing) | [src/components/chat/ChatMessage.tsx](../../../src/components/chat/ChatMessage.tsx) | 2 | `ToolInvocationsBlock` adds a third branch: Tenant + `draft_negotiation_email` invocations → `NegotiationEmailCard` per invocation (resolves clauseLabel + severity from `useChatStream().toolEvents`). Reviewer/Admin still gets inline `ToolCard`. |
| `ChatMessage.test.tsx` | [src/components/chat/ChatMessage.test.tsx](../../../src/components/chat/ChatMessage.test.tsx) | 2 | New tests: Tenant + draft_negotiation_email invocation routes to `NegotiationEmailCard`; Reviewer + same invocation routes to `ToolCard`. |

No changes to `ChatStreamContext`, `scan-narrative`, or the chat API route. No new dependencies.

### 3c. Component contract

```ts
export interface NegotiationEmailCardProps {
  clauseLabel: string;            // "Security deposit · §3" — from clauseLabel() helper
  severity?: Severity;            // 'high' | 'medium' | 'low' | 'ok' — from prior grading
  subject: string;                // verbatim from tool_result.subject
  body: string;                   // verbatim from tool_result.body (preserve line breaks)
  emailId?: string;               // tool_result.email_id (audit reference; not user-visible)
}
```

Render shape (simplified):

```
┌──────────────────────────────────────────────┐
│ Email · Security deposit · §3   [⚠ HIGH]    │   ← header: clause + severity badge
├──────────────────────────────────────────────┤
│ Subject: Request to Revise Security Deposit │   ← subject (mono accent)
│                                              │
│ Hi [Landlord Name],                          │
│                                              │   ← body (paragraphs; line breaks preserved)
│ Thank you for sending over the lease. I…    │
│ …                                            │
├──────────────────────────────────────────────┤
│                          [📋 Copy email]    │   ← footer: Copy button (sunken band)
└──────────────────────────────────────────────┘
```

After click → button briefly flips to `[✓ Copied]` for ~1.6s, then back.

### 3d. Routing logic (ChatMessage)

```ts
// Tenant + draft_negotiation_email invocations route to NegotiationEmailCard.
const isTenant = viewerRole === 'Tenant';
const draftInvocations = invocations.filter(
  (inv) => inv.name === 'draft_negotiation_email',
);
const otherNonScanInvocations = nonScanInvocations.filter(
  (inv) => inv.name !== 'draft_negotiation_email',
);
const showEmailCards = isTenant && draftInvocations.length > 0;

return (
  <div className="my-2">
    {showTimeline ? <ScanTimeline … /> : <inline ToolCards for scan invs>}
    {showEmailCards
      ? draftInvocations.map((inv) => (
          <NegotiationEmailCard
            key={inv.id}
            clauseLabel={resolveClauseLabel(inv, toolEvents)}
            severity={resolveSeverity(inv, toolEvents)}
            subject={inv.result?.subject ?? ''}
            body={inv.result?.body ?? ''}
            emailId={inv.result?.email_id}
          />
        ))
      : draftInvocations.map((inv) => <ToolCard … />)}
    {otherNonScanInvocations.map((inv) => <ToolCard … />)}
  </div>
);
```

`resolveClauseLabel` and `resolveSeverity` are small helpers (likely inline in ChatMessage or extracted to a `tool-event-helpers.ts` if multiple consumers need them). They scan the event stream for the most-recent `grade_clause_severity` matching the invocation's `clause_id`.

### 3e. Acceptance walk per phase

Per-phase definitions of done live in [sprint.md](./sprint.md).

---

## 4. Acceptance criteria

### Automated

1. **AC #1 — Component renders subject + body verbatim.** Render `<NegotiationEmailCard subject="X" body="Hi…\nThanks,\n[Tenant]" … />`. Card contains "X" and the full body text (line breaks preserved as `<p>` or `whitespace-pre-line`).
2. **AC #2 — Severity badge present when severity given.** `<NegotiationEmailCard severity="high" … />` renders a `SeverityBadge` (asserted via `data-testid="severity-badge"` + `data-severity="high"`).
3. **AC #3 — Severity badge absent when severity omitted.** `<NegotiationEmailCard … />` (no severity prop) renders no SeverityBadge.
4. **AC #4 — Copy button writes the body to clipboard.** Mock `navigator.clipboard.writeText`. Click the Copy button. Assert `writeText` was called with the full body string.
5. **AC #5 — "Copied" feedback shown after click.** After click, the button label/icon flips to "Copied" / `Check` for a transient window (verified by `data-state="copied"` or similar).
6. **AC #6 — Clipboard feature detection.** When `navigator.clipboard` is undefined, the Copy button renders with `disabled` attribute.
7. **AC #7 — ChatMessage routes Tenant + draft_negotiation_email to NegotiationEmailCard.** Render `<ChatMessage role="assistant" toolInvocations={[draftInvocation]} viewerRole="Tenant" />` (in a ChatStreamProvider with a matching prior `grade_clause_severity` tool event). Assert `[data-testid="negotiation-email-card"]` is rendered; assert no `tool-card` element for that invocation.
8. **AC #8 — Reviewer/Admin still gets inline ToolCard.** Same render with `viewerRole="Reviewer"`. Assert `tool-card` is rendered; assert no `negotiation-email-card`.
9. **AC #9 — Test sweep.** `npm test` ≥ 799 + ~7 new = 806; `npm run typecheck` clean; `npm run lint` 0 errors; `npm run build` succeeds.

### Manual

1. **Manual #1 — Real scan flow.** `npm run dev` → upload sample lease → run scan → turn 2 ranks (reuses prior gradings) → turn 3 asks "Draft polished negotiation emails for each high-severity clause" → confirm:
   - 10–11 `NegotiationEmailCard`s render inline in the chat, one per high-severity clause.
   - Each card shows clause label + severity badge + subject + body.
   - Copy button works; clipboard contains the full body text.
   - The model's text response below the cards may still include the verbatim markdown (s23e.3 contract) — that's fine; the cards are the primary surface.
2. **Manual #2 — Reviewer mode.** Switch to Reviewer. Same flow. Confirm inline `ToolCard`s render instead of NegotiationEmailCards (trace fidelity).
3. **Manual #3 — Reduced motion.** DevTools → `prefers-reduced-motion: reduce`. Cards appear instantly (no entry animation); Copy interaction still works.
4. **Manual #4 — Dark mode.** Toggle dark. Card surface, severity badge, Copy button, sunken footer band all flip cleanly.
5. **Manual #5 — Keyboard.** Tab to Copy button; Enter activates; focus ring visible.

---

## 4b. Phase 4 — system-prompt refinements enabled by the new card surface (in-scope addendum)

Surfaced during the user's smoke walk after Phases 1-3 landed. Two prompt-side concerns that the new `NegotiationEmailCard` surface either creates or makes addressable:

### Fix 4a — Cards are the deliverable; the assistant text is a summary

Sprint-23e.3 forced the model to render each email's subject + body VERBATIM in markdown text because the tool_result was otherwise invisible (collapsed JSON ToolCards). With the new `NegotiationEmailCard` rendering the subject + body inline with a Copy button, the verbatim text is now duplicative — it pushes the cards below the fold and buries the actual deliverable.

**Fix:** flip the section-2.7 instruction. The cards do the rendering; the assistant text MUST be a concise summary (under ~12 lines) — a brief intro + a ranked list of emails by priority/severity with one-sentence rationales + a top-pick nudge. The verbatim subject + body must NOT appear in the assistant text.

### Fix 4b — Scan-complete summary uses a markdown table

The scan-complete assistant message previously emitted a 4-column markdown table (`# | Clause | Issue | Statute / Authority`). Recent runs drifted to a flat bulleted list. The table reads as a scannable risk register; the bullets do not. The system prompt never explicitly prescribed the table format — the model's previous behavior was emergent.

**Fix:** new section 2.8 — `scanCompleteSummarySection` — pins the table format: columns `# | Clause | Issue | Statute / Authority`, one row per HIGH and MEDIUM severity grading, sorted by severity (high first) then by clause_index, followed by `OK` / `Ungraded` / `Next steps` blocks.

### Tests (Phase 4)

- 3 new system-prompt tests for the flipped 2.7 section (forbids verbatim, requires concise summary, names the card surface).
- 3 new system-prompt tests for section 2.8 (table format, sort order, OK/Ungraded/Next-steps blocks).
- The 3 pre-existing s23e.3 tests for verbatim-render language are removed (the instruction no longer exists).

Net delta: +3 (6 new − 3 removed).

---

## 5. Out of scope

- Editing the email body in-line (out-of-scope; future sprint could add "Refine" interaction).
- Multiple stylistic variants per clause (the tool produces ONE polished draft per call; do not bundle stylistic options).
- Sending the email directly from LeaseLens (this is a draft for the user to take to their own email client; no SMTP integration).
- Bulk "Copy all" or "Download as .txt" action — single Copy per card for now.
- A new severity tier or icon for "draft email" cards (severity comes from the underlying grading).
- Re-architecting `useChatStream`'s `toolEvents` storage.
- Audit/rollback UI changes — `draft_negotiation_email` is mutating and the audit-row insert + rollback path are untouched.
- Any change to the `draft_negotiation_email` tool itself or its prompt template ([DRAFT_INSTRUCTION](../../../src/lib/tools/lease-tools.ts)).

---

## 6. Charter compliance

- **§4 invariants:** unaffected — no tool surface, RAG, audit, or streaming changes. The clipboard interaction is purely client-side.
- **§5 hard requirements:** unaffected.
- **§5.6 RBAC:** the new routing PRESERVES role-gated progressive disclosure. Tenant gets the new card; Reviewer/Admin keeps inline ToolCards for trace fidelity.
- **§6 simplicity:** the new `NegotiationEmailCard` is a small presentational component (props in, JSX out, one internal `copied` state for the button feedback). No new context, no new dependencies.
- **§7 spec-first:** this spec ships before any code edits.
- **§11b demo guardrails:** unaffected.
- **§15a Context7:** no library API changes. `navigator.clipboard` is a stable web API.

---

## 7. Cross-references

- Origin: sprint-23e smoke walk surfaced the JSON-card visibility problem; sprint-23e.3 prompt fix is the safety net; this sprint ships the proper card UX.
- Predecessors: 23a (tokens), 23c (UploadedLeaseCard pattern + entry animation), 23d (SeverityBadge), 23e (chat-memory).
- Design-system source: [design-system/MASTER.md](../../../design-system/MASTER.md).
- Token implementation: [src/app/globals.css](../../../src/app/globals.css).

---

**End of spec.**
