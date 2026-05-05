# Sprint 12 — Diagram Tool + Motion Polish

**Status:** Draft, awaiting human QA per charter §7 step 1.
**Date:** 2026-05-05.
**Charter version at draft time:** 1.11. Sprint 12 was renamed from
"Demo Deployment + README + Loom" to "Diagrams" by operator decision on
2026-05-05; the deployment closeout is deferred to Sprint 13. Charter
§16 must be amended to v1.12 in the same commit that lands this sprint —
flagged in §11 below, not actioned by this spec.

---

## 1. Problem

The chat surface produces text and structured tool results. There is no
way for the assistant to draw a picture of a process, a taxonomy, or a
state machine. Three of the brand-onboarding flows are visual by nature
and currently land as bullet lists:

- The approval pipeline (draft → review → schedule → publish).
- The brand voice taxonomy (pillar topics → sub-pillars → example posts).
- The content calendar layout for week one.

A reviewer evaluating ContentOps for an FDE / Applied AI role recognizes
the same shape they hit on real customer engagements: "the model
explained it, but I want to see it." Adding a diagram tool closes that
gap and exercises the existing tool-registry / tool-card / RBAC pillars
without inventing new architecture.

The sprint also adds entrance and layout animation via `motion`
(formerly Framer Motion) at three specific points where the current UI
reads as static rather than alive: assistant-message entry, tool-card
expand/collapse, and diagram first-paint. The animation work is not a
generic "polish pass" — it is scoped to the points where motion conveys
state change that is otherwise abrupt.

Out-of-scope motion work is enumerated in §10. Charter §6 (simplicity
meta-rule) governs: no animation that does not communicate state.

---

## 2. Invariants

These hold regardless of implementation choices below.

1. **Charter §4 architectural invariant.** The diagram tool is registered
   in the same `ToolRegistry` that drives prompt-visible schemas and
   runtime execution. A reviewer cannot find the diagram tool advertised
   to the model without it also being executable, or vice versa.
2. **RBAC.** Diagram rendering uses `roles: 'ALL'` — meaning Creator +
   Editor + Admin (the full role hierarchy). Read-only, non-mutating,
   no third-party side effects, no audit-log row. Anonymous demo
   visitors (Creator role per charter §11b) can use it.
3. **No mutation, no audit, no rollback.** The tool returns a string
   echo of validated Mermaid code; the registry's mutating-tool path
   does not run for it. `compensatingAction` is undefined on the
   descriptor.
4. **Demo-mode budget.** Diagram rendering does not call Anthropic.
   The decision to call the tool consumes one Anthropic round-trip
   (the LLM's tool_use turn), the same as any other tool. No new
   guardrail is required.
5. **Security.** Mermaid runs in `securityLevel: 'strict'` mode. HTML
   labels are disabled. The tool input is validated by a prefix
   regex before it ever reaches the renderer (§4.3). The renderer
   runs client-side in the browser, sandboxed by the same-origin
   policy of the chat page — no SSR rendering, no worker thread, no
   server-side `JSDOM`.
6. **Workspace-scoped context.** The tool itself is workspace-agnostic
   (it just renders code). The LLM is expected to call `search_corpus`
   first when the diagram describes the active brand's content. The
   system prompt enforces this expectation; the tool does not.
7. **Reduced-motion accessibility.** Every motion surface respects
   `useReducedMotion()`. When the user's OS prefers reduced motion,
   animation degrades to instant state transitions.
8. **Persistence gap is acknowledged, not fixed.** Tool invocations are
   ephemeral in the current chat (per the existing chat route — see
   §9 known limitations). Diagrams disappear on page reload. This sprint
   does not change that contract; a follow-up sprint may.

---

## 3. Architecture

### 3a. Library choices

| Library | Version | Role | Justification |
|---|---|---|---|
| `mermaid` | `^11.x` (latest 11) | Diagram rendering, client-side only | The reference uses Mermaid and confirms it covers our four target diagram families (flowchart, sequence, mindmap, state). v11 supports `securityLevel: 'strict'` and async `render()` returning `{ svg }`. Verified via Context7 against `/mermaid-js/mermaid/v11_0_0`. |
| `motion` | `^12.x` (latest) | React entrance + layout animation | Successor to `framer-motion` (same author, renamed package). Idiomatic React 19 + Next.js 16 App Router support via `'use client'` boundary. Import path: `motion/react`. Verified via Context7 against `/websites/motion_dev`. |

Both are added to `dependencies` in `package.json`. Neither pulls in
native modules (Mermaid is pure JS; Motion is pure JS). Both lazy-load
only on the client surface that needs them.

### 3b. Tool surface

One tool, single shape, registered alongside the existing five:

```
name:        render_workflow_diagram
category:    visualization        ← new ToolCategory variant
roles:       'ALL'                ← Creator, Editor, Admin
mutating:    no                   ← compensatingAction undefined
description: see §3b below
```

Input schema:

```jsonc
{
  "type": "object",
  "properties": {
    "code": {
      "type": "string",
      "description": "Mermaid diagram source code. Must begin with one of: flowchart, graph, sequenceDiagram, stateDiagram-v2, mindmap, journey, classDiagram, erDiagram (after stripping leading whitespace and Mermaid `%%{...}%%` directives or `%% line comment` lines per §3c). Maximum 4000 characters. Labels render as plain SVG text — HTML formatting in labels is not honored.",
      "maxLength": 4000
    },
    "title": {
      "type": "string",
      "description": "Short title shown in the diagram card header. Optional.",
      "maxLength": 120
    },
    "caption": {
      "type": "string",
      "description": "One-sentence caption shown below the diagram. Optional.",
      "maxLength": 280
    }
  },
  "required": ["code"]
}
```

Output (returned as `result`, JSON-serializable):

```jsonc
{
  "code": "<echoed validated mermaid source>",
  "title": "<echoed if provided>",
  "caption": "<echoed if provided>",
  "diagram_type": "flowchart" | "sequenceDiagram" | "stateDiagram-v2" | "mindmap" | "journey" | "classDiagram" | "erDiagram" | "graph"
}
```

On validation failure (prefix mismatch, length excess, suspicious
characters per §3c), the tool throws — same shape as other read-only
tools — and the chat route surfaces the error string in the
`tool_result` event for `ToolCard` to display in the existing error
pill state.

### 3c. Validation pipeline

The tool's `execute` is a pure function with two checks:

1. **Prefix check.** Strip leading whitespace, then iteratively strip
   leading lines matching either `^%%\{[\s\S]*?\}%%\s*$` (Mermaid
   init directive) or `^%%[^\n]*$` (line comment) until reaching a
   non-comment line. That line must start with one of the eight
   diagram keywords listed in `DIAGRAM_PREFIX` (extracted from the
   reference's `MERMAID_DIAGRAM_PREFIX` regex, restricted to the
   eight families we actually support). The matched keyword is
   recorded as `diagram_type`. Failure throws with a message naming
   the eight allowed prefixes.
2. **Length check.** `code.length <= 4000`. Excess fails fast before
   reaching the renderer.

Mermaid parse errors are NOT pre-validated server-side (no JSDOM, no
worker). The renderer in the browser surfaces parse errors via its own
error state — the diagram card displays the raw code in a code block
with the parse message, similar to a code editor. This is intentional:
parse-failed diagrams are a useful signal in a portfolio demo (the
operator can ask the model to fix the diagram conversationally), and
duplicating Mermaid's grammar in a server-side validator is exactly the
kind of speculative complexity §6 of the charter rules out.

### 3d. UI surface

New component, client-only, dynamically imported to keep Mermaid out
of the SSR bundle:

```
src/components/chat/MermaidDiagram.tsx
```

Contract:

```ts
interface MermaidDiagramProps {
  code: string;
  title?: string;
  caption?: string;
}
```

Rendering rules:

- `'use client'` directive at top.
- Dynamic-import `mermaid` once on mount, cache the module reference.
- `mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', flowchart: { htmlLabels: false } })` on first use.
- Call `mermaid.render(uniqueId, code)` and inject the returned SVG
  via `dangerouslySetInnerHTML` — Mermaid's `securityLevel: 'strict'`
  is the threat model here.
- On parse error, fall back to a `<pre>` block of the code plus the
  error message in a muted style; expose the title/caption regardless.
- Wrap the rendered SVG for first-paint reveal. Reduced-motion is
  honored by *conditional render*, not by `transition: { duration: 0 }`
  (which still triggers a frame):
  - When `useReducedMotion()` returns `true` **or** when the component
    has not yet mounted (SSR / first client paint): render a plain
    `<div data-motion="off">` around the SVG with no animation props.
  - When the component has mounted and reduced-motion is false:
    render `<motion.div data-motion="on" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35, ease: 'easeOut' }}>`.

The `data-motion` attribute is a stable test hook so unit tests can
assert which branch ran without depending on Motion runtime style
attributes that vary across hydration and framerate. The mounted-state
guard prevents the SSR-flash failure mode described in sprint-plan
risk 3.

`ToolCard.tsx` is extended in one place: when `invocation.name ===
'render_workflow_diagram'` and `invocation.result` parses as the
output shape above, the card renders `<MermaidDiagram>` *above* the
existing collapsible Input/Result panes. The diagram becomes the
primary content; the JSON details are still inspectable behind the
chevron.

### 3e. Motion polish (three surfaces)

| Surface | File touched | Animation | Reason |
|---|---|---|---|
| Diagram first paint | `MermaidDiagram.tsx` | fade + scale-in 0.97 → 1.0, 350ms ease-out | The diagram is the new feature; the entry sells it. |
| `ChatMessage` entry | `ChatMessage.tsx` | assistant-only fade + 8px slide-up, 250ms ease-out | New assistant turns currently snap in; subtle reveal makes the chat feel responsive. User messages stay instant — twitchy feel rejected. |
| `ToolCard` expand/collapse | `ToolCard.tsx` | layout-animated height + fade-in of expanded body, 220ms | Currently collapses abruptly. `motion.div layout` solves it without manual height measurement. |

All three surfaces honor `useReducedMotion()` via the same conditional
render pattern as §3d: when reduced motion is preferred, the surface
renders the plain DOM equivalent (`<div>`, `<li>`) with no animation
props, rather than passing `duration: 0`. No other surfaces are
animated in this sprint. Particularly excluded: typing indicator
(already CSS-animated, not changed), composer focus, button hover,
empty-state cards, modal entry. See §10.

### 3f. System prompt

`src/lib/chat/system-prompt.ts` gains one paragraph instructing the
model when to call `render_workflow_diagram`. Suggested topics named
in the prompt: *approval pipeline*, *content calendar layout*,
*brand voice taxonomy*, *publishing state machine*. The prompt also
instructs: when the diagram describes the active brand's content,
call `search_corpus` first to ground the diagram nodes in real brand
material; otherwise produce a neutral generic diagram.

### 3g. File layout

| Action | File |
|---|---|
| New | `src/lib/tools/diagram-tools.ts` — `createRenderWorkflowDiagramTool(db)` |
| New | `src/lib/tools/diagram-tools.test.ts` — prefix validation, length, output shape |
| New | `src/components/chat/MermaidDiagram.tsx` |
| New | `src/components/chat/MermaidDiagram.test.tsx` |
| Modified | `src/lib/tools/domain.ts` — `ToolCategory` adds `'visualization'` |
| Modified | `src/lib/tools/create-registry.ts` — register new tool |
| Modified | `src/components/chat/ToolCard.tsx` — render `MermaidDiagram` for matching tool name |
| Modified | `src/components/chat/ToolCard.test.tsx` — diagram-render branch |
| Modified | `src/components/chat/ChatMessage.tsx` — `motion.li` entry animation |
| Modified | `src/components/chat/ChatMessage.test.tsx` — reduced-motion branch |
| Modified | `src/lib/chat/system-prompt.ts` — diagram-tool instruction paragraph |
| Modified | `src/lib/chat/system-prompt.test.ts` — assert paragraph present |
| Modified | `package.json` — `mermaid`, `motion` |
| Modified | `mcp/contentops-server.ts` — register new tool over MCP (parity with chat-route registry per charter §4 invariant) |
| Modified | `mcp/contentops-server.test.ts` — diagram tool exposed over MCP |
| Sprint-plan-decides | `src/app/api/chat/diagram-tool.integration.test.ts` (or extension of an existing chat-route integration test) — exercises the diagram tool's `tool_use` and `tool_result` events through the NDJSON stream, mirrors the Sprint 7 integration pattern |

The sprint plan (next §7 step) names exact tasks and verification
commands per file. The "sprint-plan-decides" row is optional coverage
the sprint-plan author chooses based on budget; default is to include
it.

---

## 4. Acceptance criteria

A reviewer following the demo flow verifies these:

1. Open `/`, send "Draw the approval pipeline." Within 5 seconds, an
   assistant message appears containing a `ToolCard` for
   `render_workflow_diagram`. Above the card body, a Mermaid flowchart
   renders. The diagram fades and scales in over ~350ms.
2. Click the chevron on the same `ToolCard`. The Input / Result panes
   reveal with an animated height transition. Click again — they
   collapse smoothly. No layout jump.
3. Send "Draw the brand voice taxonomy for Side Quest Syndicate."
   Two parts of this scenario, asserted separately:
   - **Code-asserted** (`system-prompt.test.ts`): the diagram-tool
     instruction paragraph in the system prompt directs the model to
     call `search_corpus` first when the diagram describes brand
     content.
   - **Manual-smoke** (recorded in `impl-qa.md`): on the seeded sample
     workspace running against Claude Haiku 4.5, the typical flow
     shows `search_corpus` preceding `render_workflow_diagram` and the
     diagram nodes reference brand pillars from the seeded corpus.
     A single trial that skips the `search_corpus` call is not a
     sprint-blocking defect unless it reproduces deterministically.
4. Send a malformed diagram instruction: "Render a diagram starting
   with `not-a-keyword`." The tool execution returns an error; the
   `ToolCard` shows the error pill and the validation message. No
   white-screen, no console error, no stuck streaming state.
5. Force a Mermaid parse error (e.g., the model produces syntactically
   valid prefix but broken body). The card renders the raw code in a
   monospace block with the parse-error string below. Title and caption
   still render.
6. Enable "Reduce motion" in the OS accessibility settings, refresh,
   repeat scenario 1. The diagram appears without animation. New
   assistant messages appear without slide-in. Tool-card expand /
   collapse is instant.
7. Switch to a freshly uploaded workspace, ask for the brand's content
   calendar diagram. The model calls `search_corpus` against the new
   workspace (not the old one) before drawing. Charter §11
   workspace-scoping invariant holds.
8. As an Admin in `/cockpit`, view the Recent Actions feed. Diagram
   renders do **not** appear there (they are read-only, non-audited).
   Existing audit entries are unaffected.
9. From the demo's Side Quest Syndicate sample workspace, the same
   four prompts in scenarios 1, 3, 4, 5 work without an
   `ANTHROPIC_API_KEY` if a mocked-tool-loop test environment is used —
   the diagram component itself is independent of the LLM call.

---

## 5. Verification commands

Standard plus sprint-specific:

```
npm run typecheck
npm run lint
npm run test
npm run eval:golden
```

Sprint-specific additions (declared in the sprint plan):

```
npx vitest run src/lib/tools/diagram-tools.test.ts
npx vitest run src/components/chat/MermaidDiagram.test.tsx
npx vitest run src/components/chat/ToolCard.test.tsx
```

Manual smoke (recorded in `impl-qa.md`):

```
npm run dev
# Step through acceptance scenarios 1-9 against http://localhost:3000.
```

Test count baseline: 279 (from charter v1.11). Expected delta: +6 to
+10 tests for the new tool, the renderer's parse + reduced-motion
branches, and the system-prompt assertion. Sprint plan pins the exact
count.

The eval harness (`eval:golden`) is unchanged — diagrams are not part
of the groundedness eval (no LLM ground-truth answer to assert against
the diagram source). The five existing golden cases must still pass
5/5.

---

## 6. Demo positioning

The diagram tool is recommended (not bound) for Sprint 13's Loom
walkthrough — the operator's stated rationale for the Sprint 12 / 13
reorder hinges on a diagram moment being demoable. The Sprint 13
spec author decides what the Loom covers; this spec records the
recommendation and a concrete demo beat the Sprint 13 author may
adopt:

> Operator types: "Draw the approval flow for Side Quest Syndicate."
> Model calls `search_corpus`. Within 4 seconds, a flowchart fades in
> showing draft → editor review → approval → schedule. Operator clicks
> the tool card chevron — the JSON `compensating_action_payload` (or
> in this case, the validated Mermaid source) reveals with a smooth
> animation. The visual / structural duality is the demo point.

If the diagram moment cannot be made to feel snappy on Vercel's
cold-start path under public network conditions, the Sprint 13 spec
must include a perf carve-out (e.g., warm-path priming on the demo's
landing route). That is a Sprint 13 problem, not a Sprint 12 problem.

---

## 7. Out of scope

Explicitly **not** in Sprint 12. Each entry below was considered and
rejected for the reason given. A future spec may revisit any of them.

| Item | Reason for exclusion |
|---|---|
| Server-side Mermaid rendering in a worker thread (the reference's pattern) | Reference uses it for media-asset persistence (caching SVGs in `UserFileSystem`). ContentOps does not persist diagrams; client-side rendering is sufficient and removes ~150 lines of `node:worker_threads` + JSDOM polyfill code. |
| Structured-spec input shape (the reference's `chartType` + `nodes` + `edges` schema) | A 200-line spec-to-Mermaid compiler that solves a problem we do not have: Claude 4.x writes Mermaid syntax fluently. Raw-code-with-prefix-validation is the simpler shape. |
| Persistence of tool invocations across page reloads | Pre-existing limitation of the chat route — affects all tool cards, not just diagrams. Fixing it requires a `tool_invocations` table or embedding tool state into `messages.content`. Out of scope for Sprint 12; flagged as a candidate sprint. |
| Mermaid diagrams in Markdown code fences (` ```mermaid ` blocks) | Bypasses the tool registry → no RBAC, no chat-route audit visibility, no telemetry. Charter §4 says model-visible schemas must match runtime tools. Code-fence rendering would be a back-channel into the renderer that does not appear in the prompt. |
| Diagram editing UI (operator hand-edits the Mermaid source) | ContentOps is a chat-driven cockpit, not an authoring environment. Operators iterate diagrams by asking the model to revise; a direct-edit affordance would invert the product's mental model. |
| Diagram export (PNG / SVG download) | Useful but not required to demo the architecture pillars. Carve-out candidate for Sprint 13's polish if there is budget. |
| Animated nodes / streaming reveal of the diagram (nodes appear sequentially) | High effort, narrow payoff. The 350ms fade+scale reads as polished without per-node animation. |
| Motion on user messages, composer, modal, role switcher, empty-state cards, header, cockpit feeds | Three motion surfaces (§3e) earn their place by communicating state change. The rest are static-on-purpose; animating them would be polish-for-polish's-sake and violate §6 simplicity meta-rule. |
| Motion's premium APIs (LayoutGroup with view-transitions, scroll-triggered animation, draggable diagrams) | Sprint 12 needs three motion components, not the framework's full surface. |
| Replacing the typing indicator's CSS animation with motion | The existing CSS animation works and is invisible to library swap. No reason to touch it. |
| Mermaid theme customization beyond `theme: 'neutral'` | The neutral theme matches the existing chat surface. Custom theming is a polish item for Sprint 13 if needed. |
| FTS5 + BM25 hybrid retrieval for diagram-specific node grounding | Carried-over deferred item from charter v1.8; orthogonal to diagrams. |

---

## 8. Risks & open questions

These do not block the spec but the sprint plan must address them:

1. **Mermaid bundle size.** Mermaid 11 is non-trivial in bundle size.
   The dynamic import keeps it out of SSR and out of the initial chat
   bundle, but the first time a diagram is rendered the user pays the
   download cost. The sprint plan must measure the exact build-output
   delta on a clean `npm run build`, document the figure in
   `sprint.md`, and confirm the lighthouse score does not regress
   below the Sprint 11 baseline.
2. **`mermaid.render` global state.** Mermaid's render API uses a
   module-level singleton; concurrent renders on the same page must
   pass unique `id` arguments. The `MermaidDiagram` component must
   generate a UUID per mount (use `useId()` from React 19).
3. **`securityLevel: 'strict'` and `dangerouslySetInnerHTML`.** Mermaid
   sanitizes its own SVG output in strict mode. Combining that with
   React's `dangerouslySetInnerHTML` is the documented pattern. The
   `MermaidDiagram` test file must include an XSS smoke test:
   passing `code` containing `<script>` and `<img onerror>` payloads
   and asserting the rendered output contains no executable script
   nodes.
4. **Reduced-motion and Motion's `LayoutGroup`.** `useReducedMotion()`
   returns a boolean snapshot. The three motion surfaces must
   short-circuit rather than passing different transition props
   (passing `duration: 0` still triggers a frame; conditional
   render of `motion.div` vs. plain `div` is the safer pattern).
5. **MCP server parity.** The new tool must be exposed over the
   custom MCP server (charter §4 invariant). The MCP server's
   stdio transport returns plain JSON; clients without a Mermaid
   renderer get the validated `code` string and can render
   themselves or just read the source.

---

## 9. Known limitations carried forward

- Tool invocations (and therefore diagrams rendered in tool results)
  do not survive page refresh. This is the existing chat-route
  contract; Sprint 12 does not change it.
- Mermaid parse errors are surfaced client-side only. There is no
  server-side syntax validation. This is by design (§3c).
- The eval harness does not verify diagram quality. Diagram-aware eval
  cases would require a Mermaid AST comparison harness; out of scope.

---

## 10. Charter §16 amendment required

This sprint's existence requires a charter amendment that the spec
itself does not perform:

> v1.11 → v1.12: Sprint 12 renamed from "Demo Deployment + README +
> Loom" to "Diagram Tool + Motion Polish." Sprint 13 added with the
> deferred deployment closeout scope. Total sprint count goes from
> 13 to 14.

The amendment lands in the same commit as the Sprint 12
implementation (per charter rule "Documentation lands in the same
commit as the code"). Spec authoring does not edit the charter.

---

## 11. Verification of spec quality

This spec was authored by reading:

- Charter v1.11, §§1–16 in full.
- `docs/_meta/agent-guidelines.md` and `docs/_meta/architecture.md`
  for stack constraints and module-map alignment.
- `docs/_references/ai_mcp_chat_ordo/src/lib/media/server/compose-media-mermaid-renderer.ts`
  and `chart-generation-service.ts` and
  `src/core/use-cases/tools/generate-chart.tool.ts` and `chart-payload.ts` —
  the reference's diagram pattern and its structured-spec compiler.
- The current ContentOps tool registry: `domain.ts`, `corpus-tools.ts`,
  `create-registry.ts`.
- The current chat surface: `ChatMessage.tsx`, `ToolCard.tsx`,
  `render-markdown.tsx`, `ChatUI.tsx`.
- Mermaid v11 rendering API via Context7 (`/mermaid-js/mermaid/v11_0_0`):
  `mermaid.render(id, code)`, `securityLevel: 'strict'`,
  `suppressErrorRendering`.
- Motion (motion.dev) React API via Context7
  (`/websites/motion_dev`): `motion/react` import path, `'use client'`
  directive, `AnimatePresence`, `useReducedMotion()`.

Cross-subsystem reasoning was performed manually because the
Sequential Thinking MCP tool was not available in the spec-authoring
session. The cross-subsystem claims that were checked:

- **Tool registry × RBAC.** The new tool's `roles: 'ALL'` aligns with
  the registry's existing pattern; no role enum extension required.
- **Tool registry × MCP server.** The MCP server registers tools from
  the same registry path, so adding the tool there is a one-liner —
  named in the file layout (§3g).
- **Tool registry × audit.** No `compensatingAction` means the
  registry's mutating-tool path is not exercised; no audit row, no
  rollback. Charter §4 invariant holds.
- **Chat surface × motion.** Motion is added at three surfaces only.
  Each surface already has a clear "before" state; the animation is
  the transition, not a new state. No surface gains hover, drag, or
  gesture interaction (those would be Sprint 13 polish if at all).
- **Demo guardrails × diagrams.** Diagrams do not call Anthropic; the
  rate limit and daily ceiling are unaffected.
- **Workspace scoping × diagrams.** The tool is workspace-agnostic;
  the system prompt is what couples diagram content to the active
  workspace via `search_corpus`. No `workspace_id` is added to the
  diagram tool's schema or context.

---

**End of spec. Awaiting human QA per charter §7 step 1 before
proceeding to spec-QA.**
