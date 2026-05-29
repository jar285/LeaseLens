# Sprint 33 (proposed) — FAB Chat × Scan Integration Brainstorm

**Type:** design brainstorm, NOT an implementation. This doc aligns on the right next move before any code lands. Sprint 32 stack (29, 30, 31, 32.0, 32.1, 32.2.0) is already committed on `feature/fab-menu`.

**Status:** approved as the alignment artifact. The user's locked decisions and three meta-concerns are captured in §10 (Appendix A) below the original brainstorm.

---

## 0. What you observed

You uploaded the lease that *has* the red flags (the residential-lease sample with 10 high-severity findings) but the FAB chat output *felt* like the clean-lease summary — "barely any red clauses." The Sprint 32.2.0 diagnostic confirms the actual gradings were correct: **10 HIGH + 1 OK + 4 ungraded (citation errors)** in the new toolEvents. So the cards on the right pane are correct.

That points the finger at the **chat surface itself**: even when the underlying data is right, the chat's *presentation* of that data is hard to map back to the cards. Combined with the conversation-history bleed from the persistent `8a8d7cf2-…` conversation_id, you sometimes get text that references *prior* turns instead of the new scan.

The user-visible symptom — "the chat told me a different story than the cards" — is what we should design away.

---

## 1. Factual baseline (current architecture)

| Aspect | FAB Chat Drawer | Right Pane (RedFlagReport) |
|---|---|---|
| Visible by default after upload | **closed** | **visible + active** |
| During scan | `ScanTimeline` (process narration) | `RedFlagsLoadingState` (6-stage staircase) + skeleton cards |
| After scan | `ScanTimeline` + assistant text (markdown table + bullets) | full red-flag cards + summary row ("2 high · 3 medium · …") |
| Conversational? | yes — chips, composer, follow-ups | no — cards + inline actions |
| Source of truth | shared (`LeaseParserContext.toolEvents`) | shared (`LeaseParserContext.toolEvents`) |
| Errored clauses | not shown (gradings filtered out) | not rendered as cards (silently dropped) |
| Model's text summary | **here, in chat bubble** | **nowhere** |

Citations: [AssistantFab.client.tsx](../../../src/components/chat/AssistantFab.client.tsx), [ChatTranscript.tsx](../../../src/components/chat/ChatTranscript.tsx), [ChatUI.tsx](../../../src/components/chat/ChatUI.tsx), [RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx), [AutoScanRunner.tsx](../../../src/components/lease/AutoScanRunner.tsx).

Both surfaces consume the same tool-event stream. They show **overlapping but not identical** views of the same scan. That's where the friction is born.

---

## 2. Why the current model produces UX friction

Three forces collide:

1. **Two canonical surfaces.** Right pane and chat both try to be "where the findings live." When the model writes a summary table, the user has to decide which surface to trust. Power-words: this is a [Don Norman](../../_architecture/power-words.md#don-norman) mental-model failure and a [Jakob Nielsen](../../_architecture/power-words.md#jakob-nielsen) visibility-of-system-status failure.
2. **Chat duplicates the cards.** The assistant's final text typically renders the *same findings* the right pane already shows, in a less scannable format. Power-words: violates [Dieter Rams](../../_architecture/power-words.md#dieter-rams) ("less but better") and [Refactoring UI / Wathan-Schoger](../../_architecture/power-words.md#adam-wathan-and-steve-schoger) (no visual hierarchy between surfaces).
3. **Model occasionally drifts.** With prior conversation history in context (the persistent `conversation_id`), the model can mix old findings into a new summary. Even when forceScan ensures tools fire, the assistant's text is still a model-generated artifact — fallible, stochastic, sometimes off.

**Root cause:** the chat is being asked to do two jobs — *narrate the scan* and *answer questions* — and the first job fights the right pane for canonical status. Drop the first job and the friction goes away.

---

## 3. 2026 design pattern that fits LeaseLens

The dominant pattern for tool-using AI products in 2026 is **chat-as-thinking-surface, document-as-canonical-artifact**. Roger Attrill's [Conversational AI Resilience Framework](https://medium.com/@think_ui/designing-for-resilient-conversations-ux-design-patterns-for-ai-interfaces-727d6ce74f15) (Medium, April 2026) describes this through four user-facing layers: **Stability**, **Focus**, **Clarity**, and **Agency** — the more an AI surface drifts or duplicates, the worse it scores against Clarity and Agency.

Anthropic's own product expresses this as **[Claude Artifacts](https://albato.com/blog/publications/how-to-use-claude-artifacts-guide)**: chat is where you talk; the artifact panel IS the work. The artifact is canonical. The chat doesn't reprint the artifact's content — it just *talks about it*.

Comparable products converge on the same:

- **Cursor** — code editor IS the canonical artifact; chat is a sidebar that *operates on* the editor, never duplicates it.
- **Linear AI** — issue / project view is canonical; AI is contextual ("write a summary," "find similar"), inline.
- **Notion AI** — the page IS the work; AI is a focused ask.
- **ChatGPT Canvas** — chat side runs the conversation; canvas side IS the document.

The LeaseLens analogue is obvious because [CLAUDE.md](../../../CLAUDE.md) already states the product invariant:

> *"LeaseLens is parser-first, assistant-second. The PDF viewer + red flags + clauses list are the load-bearing UI. The chat is opt-in."*

The pivot below aligns the *code* with that *invariant*. The citation here is *supporting* — the argument carries on the verifiable products (Cursor, Linear, Notion, Claude Artifacts) regardless of the framework reference.

---

## 4. Recommended pivot (Sprint 33 spec)

### Phase A — Strip the chat to a Q&A-only surface

| Today | After Sprint 33.A |
|---|---|
| `AutoScanRunner` fires; tool events stream into BOTH the chat (as ScanTimeline) AND the right pane (as cards) | tool events stream into the right pane ONLY; chat shows nothing of the auto-scan |
| Drawer empty-state chips swap by lifecycle (`MID_SCAN_CHIPS`, `REVIEW_READY_CHIPS`) | empty-state copy: *"Ask about any clause, citation, finding, or what to negotiate."* Chips are scan-agnostic Q&A starts: *"Explain the highest-risk clause"* / *"Draft an email about my biggest concern"* / *"Compare to NJ law"* / *"What should I fix first?"* |
| Assistant turn renders a markdown table summarising findings | the model's system prompt is updated to NOT produce a findings table — the cards already show that. Assistant text is a CONCISE one-line acknowledgement + a pointer ("See the 10 findings on the right; ask me about any of them.") |

### Phase B — Right pane becomes the canonical artifact (UX polish)

| Today | After Sprint 33.B |
|---|---|
| Summary row says "2 high · 3 medium · …" | summary row gains an **ungraded count** + tooltip explaining citation-grounding errors. Power-words: [WCAG](../../_architecture/power-words.md#wcag) + Nielsen visibility. |
| Errored clauses silently dropped | a small "**4 clauses couldn't be graded** — citation issue · view in chat" line under the cards. Click → opens the FAB with the question pre-filled. |
| 6-stage staircase shows under "Red Flags" header during scan | staircase moves to the top of the right pane as the *primary in-flight indicator*. Cards stream in beneath it. |

### Phase C — Inline focus context (future, after A + B)

When a user clicks "Explain" on a red-flag card, the FAB opens with that single clause as the **focused context** (already implemented via `fab.selection` — Sprint 29.3). The chat then becomes a per-clause conversation, never a "summarise the whole lease" surface. The chat is *narrow* by design.

### What we explicitly drop

- The model's "## Scan Complete — Red Flag Summary" table in the chat bubble.
- The `ScanTimeline` re-narration of the scan inside the chat (the right-pane staircase already does this).
- Any code path that pulls the model's text *summary* into the right pane (there is none today — keep it that way).

### What we explicitly keep

- `forceScan: true` / `tool_choice: { type: 'any' }` from Sprint 32.1 — tools still fire deterministically.
- `LeaseParserContext.toolEvents` as the single source of truth — both surfaces still consume it; the chat just stops *rendering* it.
- Sprint 29.3 context bar — "Focused on: clause · §N" stays; it's how Phase C works.

---

## 5. Open design questions

These were the four shape choices the brainstorm left open. See §10 (Appendix A) for the locked decisions.

1. **Should the chat show ANYTHING about the auto-scan when it completes?** (a) Nothing — silent. (b) A 1-line synthetic message. (c) A small toast outside the chat that fades.
2. **What happens when the user types "run the scan again"?** Re-trigger the full auto-scan flow via the existing chat path? Or move that into a "Replace lease" / explicit button?
3. **Errored-clause transparency — chat or right pane?** Right-pane sub-line (closer to the cards) or chat-side (less visual weight)?
4. **Should the existing scan-complete summary table (markdown) be retired entirely?** We'd remove that instruction from the system prompt. Confirming OK with losing the table format.

---

## 6. Implementation outline (only after design lock)

| File | Change | Sprint slice |
|---|---|---|
| [src/lib/chat/system-prompt.ts](../../../src/lib/chat/system-prompt.ts) | Replace the "scan-complete summary table" section with concise hand-off copy ("the right pane shows the findings; your job is Q&A") | 33.A |
| [src/components/chat/AssistantFab.client.tsx](../../../src/components/chat/AssistantFab.client.tsx) | Replace `MID_SCAN_CHIPS` / `REVIEW_READY_CHIPS` derivation with the new Q&A-only chip set | 33.A |
| [src/components/chat/ChatTranscript.tsx](../../../src/components/chat/ChatTranscript.tsx) | Stop rendering ScanTimeline tool invocations during auto-scan turns (gate on conversation provenance) | 33.A |
| [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) | Add ungraded-count summary line + "see in chat" hand-off | 33.B |
| Tests | Pin: chat empty state, chips, the absence of a ScanTimeline from the auto-scan, the ungraded line, the system-prompt section change | 33.A + 33.B |

Estimated touch: ~150 LOC across 4 files + tests (pre-Appendix-A scope; final number rises with §10's additions).

---

## 7. Trade-offs

- **Pro:** chat stops competing with the right pane. The "they don't agree" pain goes away by construction.
- **Pro:** aligns code with the parser-first product invariant from [CLAUDE.md](../../../CLAUDE.md).
- **Pro:** chat becomes more *useful* because it's not trying to be a summary tool — it can actually answer questions deeply.
- **Con:** users who liked seeing the streamed "Reviewing X" timeline in the chat lose it. (Mitigation: the right-pane staircase keeps the same information.)
- **Con:** the model's markdown table is currently a "wow, look at all this analysis" moment that some users may like as a signal of value. (Mitigation: the right pane now owns that moment — see §10's verdict-headline decision.)
- **Risk:** the chat-as-pure-Q&A direction needs the system prompt rewrite to land cleanly. If the model can't be steered away from re-listing findings, we'd need stronger guardrails. Tractable.

---

## 8. Sources

- [Claude Artifacts: What They Are and How to Use Them (2026) — Albato](https://albato.com/blog/publications/how-to-use-claude-artifacts-guide)
- [What Is Claude's Generative UI Feature? How It Differs from Canvas and Artifacts — MindStudio](https://www.mindstudio.ai/blog/what-is-claude-generative-ui-vs-canvas-artifacts)
- [Designing for resilient conversations: UX design patterns for AI interfaces — Roger Attrill, April 2026](https://medium.com/@think_ui/designing-for-resilient-conversations-ux-design-patterns-for-ai-interfaces-727d6ce74f15) — Conversational AI Resilience Framework: Stability / Focus / Clarity / Agency layers.
- [Where should AI sit in your UI? — Sharang Sharma, UX Collective](https://uxdesign.cc/where-should-ai-sit-in-your-ui-1710a258390e)
- [AI Chat Layout Patterns: When to Use Them — Anastasia Walia](https://medium.com/@anastasiawalia/ai-chat-layout-patterns-when-to-use-them-real-examples-d03f04a19194)
- LeaseLens internal: [docs/_architecture/power-words.md](../../_architecture/power-words.md), [CLAUDE.md](../../../CLAUDE.md)

---

## 9. Approval gate

1. This doc is the alignment artifact. The brainstorm framing + open questions are recorded above; §10 records the post-review locked decisions.
2. **Sprint 33.0 ships first** (foundation — conversation_id scoping; see §10). TDD red→green, gate sweep, QA report into [impl.md](./impl.md). User approval before 33.A.
3. **Sprint 33.A + 33.B ship together** (verdict in pane + chat trimmed) — they're co-dependent; without the verdict in the pane, removing the chat's table regresses the user's prioritisation experience.
4. Sprint 33.C deferred.

---

## 10. Appendix A — User review: locked decisions + meta-concerns

The brainstorm above was reviewed. Three meta-concerns and four shape-choice answers landed; they are recorded here so the spec author (future you) builds on them, not on the open questions in §5.

### Meta-concern 1 — Conversation-state bleed survives any chat redesign

> *"The pivot fixes surface competition but only partially fixes the thing that actually burned you. … None of it scopes or resets the conversation_id. After Sprint 33 ships, the failure mode is narrower but still live: a user uploads a new lease, asks the Q&A chat 'explain the highest-risk clause,' and the model answers partly from the previous lease's context. You've removed the auto-summary where this used to show up, but you haven't removed the staleness — you've just moved it somewhere quieter and harder to notice, which is arguably worse."*

**Lock:** add a **Sprint 33.0** foundation slice — conversation scoping. Reset conversationId to null on every fresh upload AND on every Replace. The route creates a fresh conversation row when AutoScanRunner POSTs with `startNewConversation: true`. Pin the invariant with a [Kent C. Dodds](../../_architecture/power-words.md#kent-c-dodds--testing-library)-style behavioural test: upload lease A, ask Q, upload lease B, ask Q, assert lease A's findings absent from lease B's answer. Power-words: this is a [Dan Abramov](../../_architecture/power-words.md#react-team--dan-abramov) state-ownership and [Eric Evans](../../_architecture/power-words.md#eric-evans) domain-language fix — the conversation_id was modeled as a durable session but the domain reality is "one conversation per lease scan."

**Ships first**, before 33.A. The `forceScan: true` from Sprint 32.1 guarantees tools fire; 33.0 guarantees the context they fire against is clean.

### Meta-concern 2 — Pivot risks throwing away synthesis, not just duplication

> *"The chat summary table was duplication of the cards — agreed, kill it. But a good summary also did something the cards don't: it answered the implicit question 'is this lease bad, and what do I worry about first?' The cards are a list; '2 high · 3 medium' is a count, not a verdict."*

**Lock:** Sprint 33.B's summary row gains a **synthesized verdict headline**, computed in TypeScript from `gradings` (NOT model-generated). Examples by tier:

- High-risk tier: *"High risk — 10 findings, biggest concern is **Indemnification (§10)**."*
- Mixed: *"1 medium finding to review — security deposit clause."*
- Clean: *"Lease is balanced — no high-severity issues."*

The headline picks the highest severity tier, the count, and the top-1 clause title from `useScanProgress()` + `gradings`. Pure function, fully unit-testable. Power-words: [Source-Grounded AI](../../_architecture/power-words.md#source-grounded-ai) — the headline is *computed from* the cards, not invented.

**33.A and 33.B ship together** as a single release — without the verdict landing in the pane, removing the chat's table regresses the user's prioritisation experience.

### Meta-concern 3 — Citation false-authority check

> *"The Roger Attrill 'Designing for Resilient Conversations, April 2026' quote is doing rhetorical heavy lifting in §3, and I can't verify it exists. Per your own 'main risk' section, that's the textbook false-authority pattern."*

**Lock:** the article exists. The specific pull-quote I attributed to it was paraphrased, not a verifiable quote — corrected in §3 above. The citation now references the article's **Conversational AI Resilience Framework** (Stability / Focus / Clarity / Agency layers) without manufactured prose. Argument carries on the verifiable products (Cursor, Linear, Notion, Claude Artifacts) regardless of the framework reference.

### Locked answers to §5's four shape choices

| § | Question | Answer |
|---|---|---|
| 5.1 | Show anything on scan complete? | (b) one-line synthetic hand-off — **generated deterministically in code, not by the model**, so it can't drift. A model-authored "scan complete" line would reintroduce the stochastic surface we're retiring. |
| 5.2 | "Run scan again" trigger? | **Explicit Replace lease button**, NOT a chat path. Re-running a scan via conversational intent is what keeps the chat coupled to scan orchestration — the coupling we're breaking. |
| 5.3 | Errored-clause transparency placement? | **Right pane, next to the cards** (proximity = trust, [Nielsen](../../_architecture/power-words.md#jakob-nielsen)), with the "view in chat" hand-off. The chat stays as the consistent "ask why" surface, including for errors. |
| 5.4 | Retire the markdown summary table? | **Yes — but only sticks if the right pane absorbs the verdict** (see Meta-concern 2). Retiring the table while leaving the pane as a bare list is where the loss would be felt. |

### Revised sprint shape (after locked decisions)

| Slice | What ships | Co-dependent? |
|---|---|---|
| **33.0** | Conversation-id reset on fresh upload + Replace; Kent-C-Dodds test pins the lease-A→lease-B isolation invariant | No — foundation; ships first as its own commit |
| **33.A + 33.B** | Chat becomes Q&A-only (no ScanTimeline, no model summary table, scan-agnostic chips, deterministic code-generated scan-complete receipt) AND right pane absorbs the verdict headline + ungraded line + chat hand-off | **Yes** — must ship together |
| 33.C | Per-clause inline focus chat (already half-built via Sprint 29.3 `fab.selection`) | Deferred |

### What changes in §4's tables after the locked decisions

- The Phase A "assistant text is a CONCISE one-line acknowledgement" stays — BUT this line is now generated **client-side in code**, not by the model. Per locked answer 5.1.
- The Phase B summary row line "ungraded count + tooltip" stays, AND adds the synthesized **verdict headline** per Meta-concern 2.
- Phase C is unchanged but explicitly deferred.

### Critical files (revised)

| Slice | File | Change |
|---|---|---|
| 33.0 | [src/components/lease/WorkspaceRouterShell.tsx](../../../src/components/lease/WorkspaceRouterShell.tsx) | `handleUploadedFromLanding` + `handleReplace` reset conversationId to null in addition to the lease state. |
| 33.0 | [src/components/lease/AutoScanRunner.tsx](../../../src/components/lease/AutoScanRunner.tsx) | POST body sends `startNewConversation: true` on a fresh upload so the route never reuses a stale conversation. |
| 33.0 | [src/app/api/chat/route.ts](../../../src/app/api/chat/route.ts) | request schema accepts the flag; when set, the route creates a fresh conversation regardless of session/cookie state. |
| 33.0 | [src/app/api/chat/route.integration.test.ts](../../../src/app/api/chat/route.integration.test.ts) | Kent-C-Dodds test: lease-A answer doesn't bleed into lease-B answer. |
| 33.A | [src/lib/chat/system-prompt.ts](../../../src/lib/chat/system-prompt.ts) | replace markdown-table instruction with one-sentence hand-off instruction. |
| 33.A | [src/components/chat/AssistantFab.client.tsx](../../../src/components/chat/AssistantFab.client.tsx) | replace lifecycle-driven chips with the scan-agnostic Q&A set. |
| 33.A | [src/components/chat/ChatTranscript.tsx](../../../src/components/chat/ChatTranscript.tsx), `ChatMessage.tsx` | gate ScanTimeline rendering off for auto-scan provenance. |
| 33.A | [src/components/chat/ChatUI.tsx](../../../src/components/chat/ChatUI.tsx) | append the deterministic scan-complete synthetic message into the transcript when the auto-scan terminates with ≥1 grading. |
| 33.B | [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) | synthesized-verdict headline + ungraded line with chat hand-off. |
| 33.B | New helper in `src/lib/lease/` | `computeScanVerdict(gradings): { tier, headline, topClauseTitle }` — pure function, fully unit-testable. |
