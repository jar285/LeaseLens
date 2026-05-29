# Sprint 32.1 — Force Tool Use on Auto-Scan (Eliminate Hallucination)

## Context

Sprint 31.1's wording change ("NOT YET graded") was not strong enough to stop the model from hallucinating a scan summary instead of calling tools. The Sprint 32.0 diagnostic log confirmed it:

```
[chat-diag s32.0] {
  "iterations":1,
  "tool_use_count":0,
  "final_text_length":2899,
  "final_text_head":"I've already completed a full scan of your lease. The results are displayed in the right-pane Red Flag Report with all 15 clauses graded..."
}
```

The model received the auto-scan prompt, called ZERO tools, and returned 2899 chars of fabricated "scan complete" text. The lifecycle UI was stuck at "Upload received" because no `tool_result` events landed in `LeaseParserContext.toolEvents`.

## Root cause

Sprint 31.1's improved wording is *suggestive* — it asks the model not to skip tools. The model occasionally still ignores the suggestion. The deterministic fix is Anthropic's `tool_choice: { type: 'any' }` parameter, which **forces** the model to call at least one tool on a given turn. The model cannot return a text-only response when this is set; the API will reject that path.

## Spec

### Invariants (carried)

- Regular FAB chat behaviour unchanged. User-typed messages still use `tool_choice: 'auto'` (the default — model decides). The model can still answer with text alone for follow-up questions like "explain this finding."
- Sprint 31.1 prompt wording stays in place.
- `LeaseParserContext` boundary unchanged.
- `chatRequestBodySchema` is an additive change (one new optional field).
- The 6-stage lifecycle UI is unchanged.

### New behaviour

**A. `/api/chat` accepts a new optional `forceScan: boolean` field.**

```ts
const chatRequestBodySchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().nullable().optional(),
  forceScan: z.boolean().optional(),
});
```

When omitted or false, behaviour is unchanged (existing chat surface).

**B. When `forceScan: true`, the FIRST iteration of the agentic loop passes `tool_choice: { type: 'any' }` to Anthropic.**

Apply only on `iterations === 1`. Subsequent iterations use the default (`auto`) so the model can decide when to stop. The first iteration is always the non-streaming `messages.create` path ([route.ts:511-521](src/app/api/chat/route.ts#L511-L521)) because `useStreaming = isLastPossibleIteration` and `MAX_TOOL_ITERATIONS = 15` means iteration 1 is never the last.

**C. `AutoScanRunner` sends `forceScan: true` in its POST body.**

[AutoScanRunner.tsx:122-128](src/components/lease/AutoScanRunner.tsx#L122-L128) is the only call site that needs to change.

### Definition of done

- `chatRequestBodySchema` accepts `forceScan`.
- Route applies `tool_choice: { type: 'any' }` on iteration 1 if and only if `forceScan === true`.
- `AutoScanRunner` passes `forceScan: true`.
- Tests pin the schema change + the tool_choice wiring.
- `npm run lint` / `typecheck` / `npm test` / `npm run build` all green.
- Live verification: fresh upload of `sample-nj-clean-lease.pdf` produces tool events within ~30s; the lifecycle UI advances past `upload_received`; the Sprint 32.0 diagnostic log shows `tool_use_count > 0`.

## Spec QA — gaps, risks, drift

- **Risk: `tool_choice: 'any'` interacts badly with empty tools.** Mitigation: `toolsForRequest` is always non-empty when active (per `createToolRegistry`); also the tool_choice is only applied when forceScan is true, which is only used in the scan path where tools must be present.
- **Risk: model loops forever calling tools (no exit).** Mitigation: only iteration 1 forces tool use. Iteration 2+ uses `auto`, so the model can return text when grading is done. The `MAX_TOOL_ITERATIONS = 15` cap also remains.
- **Risk: regressing other tests.** Mitigation: the schema change is additive; the tool_choice is gated on `forceScan === true`. All existing tests that don't set forceScan see no behaviour change.
- **Risk: Sprint 32.1's force_tool doesn't actually eliminate hallucination.** Mitigation: the live verification step is mandatory. If the model STILL hallucinates somehow, we open Sprint 32.2 (failure detection + Retry UI as defense in depth).

## Out of scope

- Failure detection + Retry UI (deferred to Sprint 32.2 if live verification shows force_tool isn't sufficient).
- Strengthening the system prompt wording further (deferred — force_tool sidesteps the need).
- `resolveLeaseId` race fix (still hypothetical, deferred).
