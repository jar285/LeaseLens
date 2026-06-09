# Handoff — LeaseLens

**Snapshot:** 2026-05-30, post-Sprint 34, on `feature/fab-menu`.

This file exists so a new chat session can be productive in ≈10 minutes. It is **not** a substitute for the longer reference docs — it's an *index* into them with just enough orientation to act safely. Read this first; then follow §6 "Required reading order" before making non-trivial changes.

---

## 1. What LeaseLens is, in one paragraph

LeaseLens is a **parser-first, tenant-facing NJ residential lease red-flag reviewer**. Operator uploads a PDF lease; the workspace renders the PDF on the left and a streaming red-flag report on the right; an opt-in floating chat drawer (FAB) lives bottom-right for Q&A. The product invariant from [`CLAUDE.md`](../../CLAUDE.md): *"The PDF viewer + red flags + clauses list are the load-bearing UI. The chat is opt-in."* Everything follows from that.

For the full product story see [`docs/_meta/architecture.md`](architecture.md) §1.

---

## 2. Where the code is RIGHT NOW

- **Branch:** `feature/fab-menu` (ahead of origin/main by ~12 commits across Sprints 29-34).
- **Latest commit:** `68afc99 fix(s34): recover lost gradings via chunk-pointer canonicalisation + multi-statute split`.
- **Local working tree:** clean for the changes I shipped. There are some unrelated modifications outside the recent sprint scope (older `docs/_specs/sprint-23*` specs, `README.md`, `next-env.d.ts`, `docs/ui-ux-audit.md`, `docs/ui-ux-modernization-plan.md`) that I did NOT stage — they predate this session.
- **Gates as of last commit:** lint 0 / typecheck clean / **1105 / 1105 tests** / build clean.
- **Dev:** `npm run dev` boots a working app at `http://localhost:3000`; uploading `src/corpus/sample-lease/sample-nj-residential-lease.pdf` exercises the full scan path.

---

## 3. Sprint timeline (the work behind the current state)

Each row is one committed slice. Read the linked `impl.md` for the full QA write-up.

| Sprint | What landed | impl.md |
|---|---|---|
| 29.1–29.13 | FAB + Chat Assistant production UX refactor (compact drawer header, context bar with `detachSelection`, job-aware empty states, undo toast, FAB pill state labels, a11y audit, Escape-from-pill fix, scan-progress awareness in system prompt + drawer banner, sticky → viewport-fixed editorial rails) | [`sprint-29-fab-refactor/impl.md`](../_specs/sprint-29-fab-refactor/impl.md) |
| 30.1 | Smoother theme flip via View Transitions API + double-rAF fallback. Compositor-level snapshot crossfade on Chromium / Safari | [`sprint-30-theme-flip/impl.md`](../_specs/sprint-30-theme-flip/impl.md) |
| 31.1 | Disambiguate lease metadata in system prompt to stop "scan already done" hallucination. Replaced "{N} clauses extracted" with "indexed from the PDF text-layer at upload time — NOT YET graded" | [`sprint-31-scan-prompt-disambig/impl.md`](../_specs/sprint-31-scan-prompt-disambig/impl.md) |
| 32.0 | Per-turn diagnostic log (`[chat-diag s32.0]`) capturing tool_use_count + first 200 chars of assistant text. Confirmed Sprint 31.1 wasn't sufficient on its own | [`sprint-32-force-tool/impl.md`](../_specs/sprint-32-force-tool/impl.md) |
| 32.1 | Force tool_choice on auto-scan: `/api/chat` accepts `forceScan: true`; route passes Anthropic `tool_choice: {type: 'any'}` on iteration 1 so the model MUST call a tool. Deterministic fix at the source. AutoScanRunner sends the flag | [`sprint-32-force-tool/impl.md`](../_specs/sprint-32-force-tool/impl.md) |
| 32.2.0 | Per-tool-call diagnostic (`[chat-diag s32.2]`) capturing input_clause_id, result_clause_id, severity, error_msg_head — confirmed citation-grounding rejections were the secondary cause of "cards don't render" | [`sprint-32-force-tool/impl.md`](../_specs/sprint-32-force-tool/impl.md) |
| 33.0 | **Conversation scoping per lease scan.** `startNewConversation: true` flag on `/api/chat`: when set, route ignores any conversationId in the body and creates a fresh row. Pins the lease-A → lease-B isolation invariant via a Kent-C-Dodds-style test | [`sprint-33-fab-chat-pivot/33.0-impl.md`](../_specs/sprint-33-fab-chat-pivot/33.0-impl.md) |
| 33.A + 33.B | **Chat becomes Q&A only; right pane absorbs the verdict.** System prompt retires the markdown-table prescription; chat is a single-sentence ack. Scan-agnostic Q&A chip set. RedFlagReport gains a deterministic synthesized verdict headline (`computeScanVerdict`) + ungraded-clause line with chat hand-off. Killed the chat-vs-cards divergence bug for good | [`sprint-33-fab-chat-pivot/33.A-and-33.B-impl.md`](../_specs/sprint-33-fab-chat-pivot/33.A-and-33.B-impl.md) |
| 34.0 | Per-rejection diagnostic enrichment (`[chat-diag s32.2-reject]`) — adds rejected_citation, cited_chunk_id, chunk_heading, chunk_body_head, rejection_reason. Confirmed 75% of validator rejections are the chunk_id-as-citation pattern | [`sprint-34-citation-grounding/impl.md`](../_specs/sprint-34-citation-grounding/impl.md) |
| 34.1 | **Citation-grounding robustness.** `validateGrading` now accepts chunk_id-form citations (canonicalised to a humanised slug label like "Late fees (NJ tenant-law corpus, §5)") AND concatenated multi-statute citations (split on `;`, `&`, `and`; accept if any part is in the body). Fabrication rejection preserved. Live: 11 cards → 14, "4 ungraded" → "1 ungraded" | [`sprint-34-citation-grounding/impl.md`](../_specs/sprint-34-citation-grounding/impl.md) |

For older history (Sprints 0–28), see the corresponding folders under [`docs/_specs/`](../_specs/) and the architecture doc.

---

## 4. Open carries (queued, NOT done)

In rough priority order. Effort estimates are rough; verify against the latest impl.md before quoting.

| Carry | Source | Sized | Status |
|---|---|---|---|
| **Sprint 33.A.2 polish** — gate ScanTimeline rendering off for auto-scan turns + deterministic synthetic scan-complete receipt. Drift insurance for the current chat trim | Sprint 33.A+33.B impl §"Spec alignment" | ~150 LOC | Deferred per user direction; no current bug, polish only |
| **Sprint 34 follow-up** — 1 ungraded clause per scan still rejected (down from 4). Different pattern; would need another `[chat-diag s32.2-reject]` sample to diagnose | Sprint 34 impl §"Carry" | ~50 LOC if same shape | Open if the rate matters to ship |
| **Sprint 28 — styled Replace lease modal** — replace native `window.confirm()` with a styled inline confirmation | [`CLAUDE.md`](../../CLAUDE.md) known gotchas | ~100 LOC | Pure UX polish |
| **Sprint 28 — gitignore `next-env.d.ts`** | [`CLAUDE.md`](../../CLAUDE.md) known gotchas | 1 line | Trivial |
| **Sprint 33.C** — per-clause inline focus chat (uses existing `fab.selection` from Sprint 29.3) | Sprint 33 brainstorm §"Phase C" | ~80 LOC | Half-built |
| **Sprint 29.3 a11y** — detach × button touch target ≥44×44 (currently 28×28) | Sprint 29.3 impl note | ~10 LOC | WCAG carry |
| **Sprint 30.2** — narrow `[data-theme-surface] *` selector to token-driven set | Sprint 30 impl §"Carry" | ~80 LOC | Only matters if Firefox theme-flip jank observed |

---

## 5. How we work (the methodology, in 8 lines)

This is the contract the user expects. It's already producing tight commits and clean gates — don't shortcut it.

1. **Spec first.** Every non-trivial change starts with a `docs/_specs/sprint-N/spec.md` that captures context, invariants, new behaviour, risks, and the approval gate.
2. **Spec QA.** The spec includes a self-critical "gaps, risks, drift" section. The user reviews and pushes back; revise before any code.
3. **Single-purpose sprint slices.** One concern per sub-sprint. Co-dependent slices (e.g. Sprint 33.A + 33.B) explicitly justify their bundling.
4. **TDD red → green.** Failing tests committed first (or at least pinned in the same diff). Tests pin user-visible behaviour, not implementation details (Kent C. Dodds).
5. **Full gate sweep before commit.** `npm run lint && npm run typecheck && npm test && npm run build` must all pass. Don't skip; don't `--no-verify`.
6. **Live re-verify when relevant.** UI/UX changes go through Playwright MCP against `npm run dev`. Capture screenshots into `docs/_specs/sprint-N/screenshots/`.
7. **QA report into `impl.md`.** Every shipped sprint gets an `impl.md` with: what shipped, tests, gates, live-verify table, drift, carries.
8. **User approval gates between sub-sprints.** Don't chain 34.0 → 34.1 without showing the user the 34.0 result first. They redirect more than you expect.

When the user says "use our workflow," they mean this 8-step methodology AND/OR the Workflow tool (multi-agent orchestration) — usually the former. The Workflow tool is genuinely useful for parallel exploration (Sprint 33 brainstorm used 3 Explore agents) or focused implement+verify passes (Sprint 34.0). Don't reach for it on trivial edits.

---

## 6. Required reading order

Read top-to-bottom; you can stop reading once you've answered the question you came in with.

1. [`CLAUDE.md`](../../CLAUDE.md) at repo root — the operating rules and invariants. **Always read first**, even on quick edits.
2. This file ([`docs/_meta/handoff.md`](handoff.md)) — sprint state, carries, methodology.
3. [`docs/_meta/architecture.md`](architecture.md) — the descriptive architecture (what is, not what should be). Component tree, data flow, key context boundaries.
4. [`docs/_architecture/power-words.md`](../_architecture/power-words.md) — the named-reference vocabulary the user uses to compress design and engineering reasoning (Don Norman, Jakob Nielsen, Kent C. Dodds, Source-Grounded AI, etc.). Use these to FRAME proposals; don't drop them decoratively. The doc explicitly calls out the false-authority anti-pattern.
5. [`docs/_meta/agent-guidelines.md`](agent-guidelines.md) — code-style + interaction conventions for agents working in this repo.
6. [`docs/_meta/agent-charter.md`](agent-charter.md) — governance / invariants that DON'T break.
7. **Most-recent sprint folder:** [`docs/_specs/sprint-34-citation-grounding/`](../_specs/sprint-34-citation-grounding/) — `spec.md` first, then `impl.md`. Tells you the latest contracts and what's currently fresh.
8. Older sprint impls only when investigating something they touched. Recent stack: Sprints 29 → 34 under [`docs/_specs/`](../_specs/).

The user works in spec → code → QA loops; if the next ask isn't clear in the spec, you'll usually find the answer in §"Spec QA" of the most recent sprint or in a brainstorm doc adjacent to it ([`sprint-33-fab-chat-pivot/brainstorm.md`](../_specs/sprint-33-fab-chat-pivot/brainstorm.md) is the canonical example).

---

## 7. Architecture invariants (don't break these)

Cribbed from [`CLAUDE.md`](../../CLAUDE.md) — the ones you'll hit first.

- **Parser-first, assistant-second.** PDF + red flags + clauses are load-bearing. Chat is opt-in.
- **State ownership.** `LeaseParserContext` owns parser state (`activeLease`, `toolEvents`, `activeClauseId`, `pdfViewerRef`). `ChatStreamContext` is chat-only (`viewerRole`, `autoScanConversationId`). `AssistantFabContext` owns drawer state (`closed`/`drawer`, `pendingPrompt`, `selection`). **Do NOT re-add parser fields to ChatStreamContext** — an exposed-keys invariant test fails immediately if you do.
- **One conversation per lease scan.** Sprint 33.0 made the server force a fresh conversation when AutoScanRunner sends `startNewConversation: true`. Don't undo this; it pins the lease-A → lease-B isolation invariant.
- **Right pane is canonical for findings.** The chat does NOT reprint findings as a markdown table (Sprint 33.A). The system prompt explicitly forbids it; the verdict headline (`computeScanVerdict`) lives on the right pane.
- **`forceScan: true` + `tool_choice: 'any'`** for auto-scan only. Regular FAB chat omits the flag (Sprint 32.1).
- **Clear assistant chat ≠ Reset workspace.** "Clear assistant chat" only clears the FAB thread. The lease, clauses, red flags, and PDF survive. The only destructive workspace-reset is **Replace** in `ParserResultsShell`'s header (with `window.confirm` + Blob URL revoke + IndexedDB eviction).
- **Severity = text + icon + colour, never colour alone.** WCAG. `SeverityBadge` already does this.
- **No lease PDFs in the RAG corpus.** Corpus is NJ tenant law only.

---

## 8. Common commands

```bash
# Day-to-day
npm run dev              # http://localhost:3000 — predev seeds DB + copies pdf worker
npm run lint             # biome check src/
npm run typecheck        # tsc --noEmit
npm test                 # vitest run (unit + component + integration)
npm run test:e2e         # playwright test
npm run build            # next build

# Seed / eval (less common)
npm run db:seed          # idempotent corpus seeder
npm run eval:golden      # tier-1 eval harness
npm run eval:leases      # tier-2 lease grading eval

# MCP server (rarely needed)
npm run mcp:server       # stdio MCP server
```

**Node ≥ 20.9.0.** Env vars validated by Zod in `src/lib/env.ts`; copy `.env.example` → `.env.local` for local dev.

---

## 9. Live debugging surfaces (NODE_ENV-gated)

When you `npm run dev`, the chat API emits two diagnostic log families:

- **`[chat-diag s32.0]`** — once per `/api/chat` POST. Captures `iterations`, `tool_use_count`, `final_text_length`, `final_text_head`, `user_message_head`. Tells you whether the model called tools or hallucinated text.
- **`[chat-diag s32.2]`** — once per tool invocation (success and failure both). Captures `tool_name`, `input_clause_id`, `result_clause_id`, `result_severity`, `result_has_error`, `error_msg_head`.
- **`[chat-diag s32.2-reject]`** — once per `validateGrading` rejection. Captures `rejected_citation`, `cited_chunk_id`, `chunk_heading`, `chunk_body_head`, `rejection_reason`. Sprint 34.0 added this; it's how Sprint 34.1's fix shape was decided.

All gated on `process.env.NODE_ENV !== 'production'`. Don't add new prod-emitting logs without explicit sign-off.

---

## 10. Power-words framing in one sentence

When you propose or critique a design, frame it through the references in [`docs/_architecture/power-words.md`](../_architecture/power-words.md) — but **only when the named reference points to a concrete lesson, constraint, failure mode, or quality standard visible in the LeaseLens artifacts.** Decorative name-dropping is explicitly an anti-pattern in that doc. Strong invocations look like *"this is a Source-Grounded AI issue because the validator rejects citations that are real chunk-pointers"* — not *"this is good because Don Norman."*

---

## 11. If you remember nothing else

1. Read CLAUDE.md first.
2. Always spec before code.
3. TDD red → green; gates green before commit.
4. Sprint-style commits (`feat(sN.M): …` / `fix(sN.M): …`).
5. Don't push without explicit user direction.
6. Power-words frame the *why*, never the marketing.
7. The right pane is canonical; the chat is Q&A.
