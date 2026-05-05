# Sprint 12 — Sprint Plan

**Status:** Draft, awaiting human QA per charter §7 step 4.
**Date:** 2026-05-05.
**Implements:** [`spec.md`](spec.md) (post-QA, all S2/S3 fixes applied).
**Charter precondition:** §16 amendment v1.11 → v1.12 approved by operator
in spec-QA. Amendment lands in this sprint's implementation commit per
the charter's "documentation in the same commit as the code" rule.

---

## 1. Overview

Sprint 12 ships in **eleven phases**, one TDD red→green→refactor cycle
each. The order is dependency-driven: types → tool → registry → prompt →
renderer → integration → polish → docs. Each phase is independently
verifiable; the operator may approve at phase boundaries.

| Phase | Subject | Touches | TDD step | Est. |
|---|---|---|---|---|
| 0 | Install dependencies | `package.json`, `package-lock.json` | n/a (precondition) | 5 min |
| 1 | `ToolCategory` extended; types ready for diagram tool | `src/lib/tools/domain.ts` | RED via Phase 2 imports | 5 min |
| 2 | Diagram tool: validation, descriptor, unit tests | `diagram-tools.{ts,test.ts}` | RED → GREEN → REFACTOR | 45 min |
| 3 | Register tool in chat-route registry **and** MCP server | `create-registry.ts`, `registry.test.ts`, `mcp/contentops-server.ts`, `mcp/contentops-server.test.ts` | RED → GREEN | 25 min |
| 4 | System-prompt instruction paragraph + test | `system-prompt.{ts,test.ts}` | RED → GREEN | 15 min |
| 5 | `MermaidDiagram` client component | `MermaidDiagram.{tsx,test.tsx}` | RED → GREEN → REFACTOR | 60 min |
| 6 | `ToolCard` branches to `MermaidDiagram` for matching tool name | `ToolCard.{tsx,test.tsx}` | RED → GREEN | 30 min |
| 7 | `ChatMessage` motion entry + reduced-motion branch | `ChatMessage.{tsx,test.tsx}` | RED → GREEN | 25 min |
| 8 | Chat-route integration test for the diagram tool | `src/app/api/chat/diagram-tool.integration.test.ts` | RED → GREEN (registry already done) | 30 min |
| 9 | Manual smoke (acceptance scenarios 1–9) + bundle-size measurement | `impl-qa.md` (recorded later in step 6) | manual | 30 min |
| 10 | Charter §16 amendment v1.11 → v1.12; architecture-doc refresh | `docs/_meta/agent-charter.md`, `docs/_meta/architecture.md` | n/a (docs) | 20 min |

**Total estimate:** ~4.5 hours focused work plus manual smoke. Phase
boundaries are real commit candidates; the operator may bundle or
split per their commit preference.

**Test count target:** 279 (current) → **305 ± 2**. Phase-by-phase
breakdown:

| Phase | Δ tests | Cumulative |
|---|---|---|
| 2 | +8 | 287 |
| 3 | +2 | 289 |
| 4 | +1 | 290 |
| 5 | +6 | 296 |
| 6 | +5 (3 MermaidDiagram branch + 2 expand/collapse motion) | 301 |
| 7 | +3 | 304 |
| 8 | +1 | 305 |

---

## 2. Pre-flight (before Phase 0)

Run on a clean working tree:

```
npm run typecheck
npm run lint
npx vitest run
```

All three must be green. Lint is currently expected to surface 140
CRLF↔LF complaints (pre-existing per charter v1.10) — those are not
this sprint's gating concern, but the count must not increase.

---

## 3. Phase 0 — Install dependencies

**Goal.** Add `mermaid` and `motion` to `package.json` `dependencies`.

**Tasks.**

1. `npm install mermaid@^11` — pins to the v11 major (spec §3a). After
   install, capture the resolved version in the Phase 9 bundle-measurement
   record. Do **not** use bare `npm install mermaid` — if a v12 ships, that
   would silently jump major.
2. `npm install motion@^12` — same approach, ^12 major. Note: the
   package name is `motion`, not `framer-motion` (the library was
   renamed; same author). Import path is `motion/react`.
3. Verify install on Windows:
   - `node -e "require('mermaid')"` — must not throw.
   - `node -e "require('motion')"` — must not throw.
4. Verify nothing else in the lockfile changed unintentionally:
   `git diff package.json package-lock.json` — only `mermaid` and
   `motion` plus their transitive deps.

**Verification.**

```
npm run typecheck   # must remain green; new packages have their own types
npx vitest run      # baseline must remain green (no test depends on the new packages yet)
```

**Stop-the-line.** If `mermaid` or `motion` fails to install on Windows
(native binding error, peer-dep mismatch with React 19 / Next.js 16),
do not patch around it — surface to operator. Both libraries advertise
React 19 support; failure is a real signal.

---

## 4. Phase 1 — Extend `ToolCategory`

**Goal.** Add `'visualization'` to the `ToolCategory` union so the
diagram tool can declare its category.

**File.** [`src/lib/tools/domain.ts`](src/lib/tools/domain.ts)

**Edit.** Single one-line change:

```ts
// Before
export type ToolCategory = 'corpus' | 'system';
// After
export type ToolCategory = 'corpus' | 'system' | 'visualization';
```

**No test in this phase.** Phase 2 imports the new category and
exercises it; the type system is the assertion.

**Verification.**

```
npm run typecheck
```

---

## 5. Phase 2 — Diagram tool

**Goal.** Implement `createRenderWorkflowDiagramTool(db)` returning a
`ToolDescriptor` matching spec §3b. Pure validation; no DB read, no
LLM call. The `db` parameter is accepted for signature parity with
`createSearchCorpusTool` etc., but unused.

**Files.**

- New: [`src/lib/tools/diagram-tools.ts`](src/lib/tools/diagram-tools.ts)
- New: [`src/lib/tools/diagram-tools.test.ts`](src/lib/tools/diagram-tools.test.ts)

### 5.1 RED — write `diagram-tools.test.ts`

Test cases (8 total):

| # | Name | Asserts |
|---|---|---|
| 1 | `descriptor exposes the expected shape` | name `'render_workflow_diagram'`, category `'visualization'`, roles `'ALL'`, no `compensatingAction` |
| 2 | `accepts a valid flowchart` | execute returns `{ code, diagram_type: 'flowchart', title?, caption? }` |
| 3 | `accepts each of the 8 supported diagram types` | parameterized over `[flowchart, graph, sequenceDiagram, stateDiagram-v2, mindmap, journey, classDiagram, erDiagram]` |
| 4 | `strips Mermaid init directives before checking prefix` | input `'%%{init: {"theme":"neutral"}}%%\nflowchart TD\nA-->B'` succeeds with `diagram_type: 'flowchart'` |
| 5 | `strips Mermaid line comments before checking prefix` | input `'%% comment\n%% another\nflowchart TD\nA-->B'` succeeds |
| 6 | `rejects unknown prefix` | input `'foobar'` throws with a message naming the eight allowed prefixes |
| 7 | `rejects oversized input` | 4001-char input throws |
| 8 | `echoes optional title and caption` | `{ code, title: 'X', caption: 'Y' }` returns both fields in result |

The test file imports `createRenderWorkflowDiagramTool` from
`./diagram-tools` and a stub `ToolExecutionContext`. No `Database`
needed — pass `null as unknown as Database.Database` or use the
`vi.mock` shape if TypeScript complains.

### 5.2 GREEN — implement `diagram-tools.ts`

Module exports one factory: `createRenderWorkflowDiagramTool(db)`.

Internal constants:

```ts
const DIAGRAM_PREFIXES = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'stateDiagram-v2',
  'mindmap',
  'journey',
  'classDiagram',
  'erDiagram',
] as const;

type DiagramType = (typeof DIAGRAM_PREFIXES)[number];

const DIAGRAM_PREFIX_REGEX =
  /^(flowchart|graph|sequenceDiagram|stateDiagram-v2|mindmap|journey|classDiagram|erDiagram)\b/;

const INIT_DIRECTIVE_REGEX = /^%%\{[\s\S]*?\}%%\s*$/;
const LINE_COMMENT_REGEX = /^%%[^\n]*$/;

const MAX_CODE_LENGTH = 4000;
```

Helper:

```ts
function stripLeadingNoise(code: string): string {
  let working = code.replace(/^\s+/, '');
  while (working.length > 0) {
    const newlineIdx = working.indexOf('\n');
    const firstLine =
      newlineIdx === -1 ? working : working.slice(0, newlineIdx);
    if (
      INIT_DIRECTIVE_REGEX.test(firstLine.trim()) ||
      LINE_COMMENT_REGEX.test(firstLine.trim())
    ) {
      working =
        newlineIdx === -1 ? '' : working.slice(newlineIdx + 1).replace(/^\s+/, '');
      continue;
    }
    break;
  }
  return working;
}
```

`execute`:

```ts
async function execute(input, _ctx) {
  const code = String(input.code ?? '');
  if (code.length > MAX_CODE_LENGTH) {
    throw new Error(
      `Diagram code exceeds maximum of ${MAX_CODE_LENGTH} characters.`,
    );
  }
  const stripped = stripLeadingNoise(code);
  const match = stripped.match(DIAGRAM_PREFIX_REGEX);
  if (!match) {
    throw new Error(
      `Diagram code must start with one of: ${DIAGRAM_PREFIXES.join(', ')}.`,
    );
  }
  return {
    code,
    diagram_type: match[1] as DiagramType,
    ...(typeof input.title === 'string' ? { title: input.title } : {}),
    ...(typeof input.caption === 'string' ? { caption: input.caption } : {}),
  };
}
```

Descriptor block follows the spec §3b shape exactly. `compensatingAction`
omitted (read-only).

### 5.3 REFACTOR

If the helper or constants benefit from extraction (e.g., the regex
becomes reusable for the integration test), extract and re-test.

### 5.4 Verification

```
npx vitest run src/lib/tools/diagram-tools.test.ts
npm run typecheck
```

Phase 2 lands +8 tests. Cumulative: 279 → 287.

---

## 6. Phase 3 — Register tool (chat route + MCP server)

**Goal.** The tool appears in both prompt-visible registries (charter
§4 invariant).

**Files.**

- Modified: [`src/lib/tools/create-registry.ts`](src/lib/tools/create-registry.ts) — register call.
- Modified: [`src/lib/tools/registry.test.ts`](src/lib/tools/registry.test.ts) — assert the tool is listed for `'ALL'` roles.
- Modified: [`mcp/contentops-server.ts`](mcp/contentops-server.ts) — no code change required (it consumes `createToolRegistry`); confirm by reading and adding a comment if the existing import path no longer matches.
- Modified: [`mcp/contentops-server.test.ts`](mcp/contentops-server.test.ts) — assert MCP `list_tools` exposes `render_workflow_diagram`.

### 6.1 RED — registry test

Add to `registry.test.ts`:

```ts
it('registers render_workflow_diagram for all roles', () => {
  const registry = createToolRegistry(db);
  for (const role of ['Creator', 'Editor', 'Admin'] as const) {
    const tools = registry.listForRole(role).map((t) => t.name);
    expect(tools).toContain('render_workflow_diagram');
  }
});
```

(The exact registry method name — `listForRole` vs. `getToolsForRole`
— must match the existing API. Confirm against the actual file in
this phase before writing the test.)

### 6.2 GREEN — register

Add one line to `create-registry.ts`:

```ts
import { createRenderWorkflowDiagramTool } from './diagram-tools';
// ...
registry.register(createRenderWorkflowDiagramTool(db));
```

### 6.3 RED — MCP server test

Add to `mcp/contentops-server.test.ts`:

```ts
it('exposes render_workflow_diagram over MCP for all roles', async () => {
  // mirror the existing pattern for asserting tool presence over stdio
  const result = await listToolsForRole('Creator');
  expect(result.map((t) => t.name)).toContain('render_workflow_diagram');
});
```

### 6.4 GREEN — verify MCP server already exposes via the shared registry

Read `mcp/contentops-server.ts`. Since it consumes `createToolRegistry`,
the new tool is automatically exposed. No code change. If the test
exposes a gap (e.g., the server filters categories), surface to
operator before silently extending the filter.

### 6.5 Verification

```
npx vitest run src/lib/tools/registry.test.ts mcp/contentops-server.test.ts
npm run typecheck
```

Phase 3 lands +2 tests. Cumulative: 287 → 289.

---

## 7. Phase 4 — System-prompt instruction

**Goal.** Add one paragraph to the system prompt naming the diagram
tool, the four canonical topics, and the "search first when describing
brand content" guidance.

**Files.**

- Modified: [`src/lib/chat/system-prompt.ts`](src/lib/chat/system-prompt.ts)
- Modified: [`src/lib/chat/system-prompt.test.ts`](src/lib/chat/system-prompt.test.ts)

### 7.1 RED — assertion

Add to `system-prompt.test.ts`:

```ts
it('mentions render_workflow_diagram and prescribes search-first for brand-content diagrams', () => {
  const prompt = buildSystemPrompt('Creator');
  expect(prompt).toMatch(/render_workflow_diagram/);
  expect(prompt).toMatch(/approval pipeline|content calendar|brand voice taxonomy|publishing state machine/);
  expect(prompt).toMatch(/search_corpus.*first|first.*search_corpus/);
});
```

### 7.2 GREEN — append paragraph

Append one tool-guidance line to the existing `base` array in
`system-prompt.ts` (mirrors the existing `schedule_content_item` and
`document_slug` guidance lines so the style stays consistent):

```ts
'When asked to draw, visualize, map, or diagram a workflow, taxonomy, state machine, or relationship — call `render_workflow_diagram` with Mermaid source code. Common topics: approval pipeline, content calendar layout, brand voice taxonomy, publishing state machine. When the diagram describes the active brand\'s content, call `search_corpus` first to ground the diagram nodes in real brand material.',
```

### 7.3 Verification

```
npx vitest run src/lib/chat/system-prompt.test.ts
```

Phase 4 lands +1 test. Cumulative: 289 → 290.

---

## 8. Phase 5 — `MermaidDiagram` component

**Goal.** Client-only component that lazy-loads Mermaid, calls
`render(uniqueId, code)`, injects the SVG, falls back to a code block
on parse error, and respects `useReducedMotion()`.

**Files.**

- New: [`src/components/chat/MermaidDiagram.tsx`](src/components/chat/MermaidDiagram.tsx)
- New: [`src/components/chat/MermaidDiagram.test.tsx`](src/components/chat/MermaidDiagram.test.tsx)

### 8.1 RED — write the test

Test cases (6 total):

| # | Name | Asserts |
|---|---|---|
| 1 | `renders the rendered SVG when mermaid resolves` | mock returns `{ svg: '<svg data-test="ok"/>', diagramType: 'flowchart' }`; assert the SVG is in the DOM after `await waitFor` |
| 2 | `falls back to a `<pre>` block on render rejection` | mock rejects with `Error('parse error: bad token')`; assert `<pre>` contains the original `code` and the error message is shown |
| 3 | `renders title when provided` | title prop appears as a heading-shaped element above the diagram |
| 4 | `renders caption when provided` | caption prop appears below the diagram |
| 5 | `wraps in motion.div with data-motion="on" when mounted and reduced-motion is false` | mock `useReducedMotion → false`; after `await waitFor(...)` for the post-mount paint, find the wrapper element via `document.querySelector('[data-motion]')` and assert `data-motion === "on"` |
| 6 | `wraps in plain div with data-motion="off" when reduced-motion is true` | mock `useReducedMotion → true`; assert wrapper carries `data-motion === "off"` regardless of mount state |

Mocks at the top of the test file:

```ts
const renderMock = vi.fn();
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: renderMock,
  },
}));

const useReducedMotionMock = vi.fn();
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => useReducedMotionMock(),
  };
});
```

### 8.2 GREEN — implement `MermaidDiagram.tsx`

```tsx
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

interface MermaidDiagramProps {
  code: string;
  title?: string;
  caption?: string;
}

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        flowchart: { htmlLabels: false },
      });
      return mod.default;
    });
  }
  return mermaidPromise;
}

export function MermaidDiagram({ code, title, caption }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, '-'); // mermaid IDs cannot contain ':'
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mounted-state guard: SSR and first client paint render the plain
  // `<div>` to avoid a flash if the user prefers reduced motion. The
  // motion.div renders only after `useEffect` confirms client mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = useReducedMotion();
  const animate = mounted && !reduced;

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then((mermaid) => mermaid.render(`mermaid-${id}`, code))
      .then((result) => {
        if (!cancelled) setSvg(result.svg);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [id, code]);

  const body = error ? (
    <pre className="overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-700">
      <span className="text-red-600">Diagram parse error: {error}</span>
      {'\n\n'}
      {code}
    </pre>
  ) : svg ? (
    <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />
  ) : (
    <div className="h-24 animate-pulse rounded bg-gray-100" aria-label="Rendering diagram" />
  );

  // `data-motion` is a stable test hook ("on" / "off") so unit tests
  // can assert which branch ran without depending on Motion runtime
  // style attributes that vary across hydration / framerate.
  const wrapped = animate ? (
    <motion.div
      data-motion="on"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {body}
    </motion.div>
  ) : (
    <div data-motion="off">{body}</div>
  );

  return (
    <figure className="my-2 overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      {title && <h3 className="mb-1 text-sm font-semibold text-gray-800">{title}</h3>}
      {wrapped}
      {caption && <figcaption className="mt-2 text-xs text-gray-500">{caption}</figcaption>}
    </figure>
  );
}
```

### 8.3 REFACTOR

`mermaidPromise` is module-level cache so subsequent diagrams skip the
`initialize` round-trip. If the test surfaces this as a leak between
test files, move to a context-scoped cache.

### 8.4 Verification

```
npx vitest run src/components/chat/MermaidDiagram.test.tsx
npm run typecheck
```

Phase 5 lands +6 tests. Cumulative: 290 → 296.

---

## 9. Phase 6 — `ToolCard` integration

**Goal.** When `invocation.name === 'render_workflow_diagram'` and a
result is present, render `<MermaidDiagram>` above the existing
collapsible details. Otherwise unchanged.

**Files.**

- Modified: [`src/components/chat/ToolCard.tsx`](src/components/chat/ToolCard.tsx)
- Modified: [`src/components/chat/ToolCard.test.tsx`](src/components/chat/ToolCard.test.tsx)

### 9.1 RED — test cases

Add to `ToolCard.test.tsx` (3 new test cases):

| # | Name | Asserts |
|---|---|---|
| 1 | `renders MermaidDiagram for render_workflow_diagram with a result` | mock `MermaidDiagram` to a sentinel; assert sentinel rendered with `code`, `title`, `caption` props from `invocation.result` |
| 2 | `does not render MermaidDiagram while pending` | invocation with no result; sentinel not rendered |
| 3 | `does not render MermaidDiagram on error` | invocation with error; sentinel not rendered, existing error pill present |

```ts
vi.mock('./MermaidDiagram', () => ({
  MermaidDiagram: vi.fn(({ code, title, caption }) => (
    <div data-testid="mermaid-stub" data-code={code} data-title={title} data-caption={caption} />
  )),
}));
```

### 9.2 GREEN — branch in `ToolCard.tsx`

Add at top of the rendered card body, between the header and the
collapsible:

```tsx
import { MermaidDiagram } from './MermaidDiagram';

// inside the component
const isDiagram =
  invocation.name === 'render_workflow_diagram' &&
  invocation.result !== undefined &&
  invocation.error === undefined;
const diagramResult = isDiagram
  ? (invocation.result as { code: string; title?: string; caption?: string })
  : null;

// in the JSX, between the header and the existing collapsible:
{diagramResult && (
  <div className="border-t border-gray-100 px-3 py-2">
    <MermaidDiagram
      code={diagramResult.code}
      title={diagramResult.title}
      caption={diagramResult.caption}
    />
  </div>
)}
```

### 9.3 RED — expand/collapse layout-animation tests (per spec §3e row 3)

Add 2 more test cases:

| # | Name | Asserts |
|---|---|---|
| 4 | `expanded body is wrapped in AnimatePresence + motion.div with data-motion="on"` when reduced-motion is false | mock `useReducedMotion → false`; click the chevron; assert the expanded body's outer wrapper carries `data-motion="on"` |
| 5 | `expanded body is plain div with data-motion="off"` when reduced-motion is true | mock `useReducedMotion → true`; click the chevron; expanded body's outer wrapper carries `data-motion="off"` and the height is non-zero immediately (no animation) |

### 9.4 GREEN — layout-animated collapsible

Wrap the existing `{isExpanded && (...)}` block:

```tsx
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

// inside the component
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
const reduced = useReducedMotion();
const animate = mounted && !reduced;

// replace the existing conditional render of the expanded body with:
<AnimatePresence initial={false}>
  {isExpanded && (
    animate ? (
      <motion.div
        key="body"
        data-motion="on"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{ overflow: 'hidden' }}
      >
        {/* existing expanded-body jsx — unchanged */}
      </motion.div>
    ) : (
      <div key="body" data-motion="off">
        {/* same expanded-body jsx */}
      </div>
    )
  )}
</AnimatePresence>
```

### 9.5 Verification

```
npx vitest run src/components/chat/ToolCard.test.tsx
```

Phase 6 lands +5 tests (3 MermaidDiagram branch + 2 expand/collapse).
Cumulative: 296 → 301.

---

## 10. Phase 7 — `ChatMessage` motion entry

**Goal.** Assistant messages fade + 8px slide-up on entry. User
messages unchanged. Reduced motion → plain `<li>`.

**Files.**

- Modified: [`src/components/chat/ChatMessage.tsx`](src/components/chat/ChatMessage.tsx)
- Modified: [`src/components/chat/ChatMessage.test.tsx`](src/components/chat/ChatMessage.test.tsx)

### 10.1 RED — test cases

Add to `ChatMessage.test.tsx` (3 new test cases):

| # | Name | Asserts |
|---|---|---|
| 1 | `assistant message renders motion.li with data-motion="on" once mounted (reduced-motion off)` | mock `useReducedMotion → false`; after `await waitFor(() => listitem has data-motion="on")` |
| 2 | `assistant message renders plain li with data-motion="off" when reduced-motion is on` | mock `useReducedMotion → true`; `<li>` carries `data-motion="off"` regardless of mount state |
| 3 | `user message renders plain li with data-motion="off" regardless of reduced-motion` | both mock states render the user-message variant with `data-motion="off"` |

**Verification note (per charter §7 step 3):** before writing the
`<motion.li>` JSX, run a one-line Context7 lookup to confirm
`motion.li` is the correct proxy name (Motion exposes proxies for
all HTML tags; the lookup is a 30-second sanity check, not a
research pass).

### 10.2 GREEN — conditional motion wrap with mounted-state guard

Refactor the existing `<li>` to:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

// inside ChatMessage
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
const reduced = useReducedMotion();
const animate = mounted && !reduced && role === 'assistant';

const liClassName = `flex gap-3.5 py-4 ${isUser ? '' : 'rounded-xl bg-gray-50 px-4'}`;

const inner = (
  // existing avatar + name + content jsx
);

return animate ? (
  <motion.li
    data-motion="on"
    className={liClassName}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
  >
    {inner}
  </motion.li>
) : (
  <li data-motion="off" className={liClassName}>{inner}</li>
);
```

The mounted-state guard (`useEffect(() => setMounted(true), [])`)
prevents the SSR flash described in plan §16 risk 3 — during SSR
and the first client paint, the plain `<li>` renders. The motion
variant only appears on the second paint, with `initial` correctly
applied.

### 10.3 Verification

```
npx vitest run src/components/chat/ChatMessage.test.tsx
```

Phase 7 lands +3 tests. Cumulative: 299 → 302.

---

## 11. Phase 8 — Chat-route integration test

**Goal.** Confirm `tool_use` and `tool_result` NDJSON events for
`render_workflow_diagram` flow end-to-end through the chat route.

**File.**

- New: [`src/app/api/chat/diagram-tool.integration.test.ts`](src/app/api/chat/diagram-tool.integration.test.ts)
  (or extension of `route.integration.test.ts` — sprint-plan author
  picks one; the new-file form is preferred for the existing suite's
  modularity.)

### 11.1 RED — write the integration test

Mirror the mock pattern from `route.integration.test.ts`. The
Anthropic stub returns:

```ts
// First create() response — tool_use block
{
  content: [
    {
      type: 'tool_use',
      id: 'toolu_diag_1',
      name: 'render_workflow_diagram',
      input: { code: 'flowchart TD\nA-->B', title: 'Test diagram' },
    },
  ],
  stop_reason: 'tool_use',
  usage: { input_tokens: 10, output_tokens: 5 },
}
// Second create() response — final assistant text
{
  content: [{ type: 'text', text: 'Here is the diagram.' }],
  stop_reason: 'end_turn',
  usage: { input_tokens: 12, output_tokens: 8 },
}
```

Assertions:

1. The streamed NDJSON includes one `tool_use` event with
   `name: 'render_workflow_diagram'`.
2. The streamed NDJSON includes one `tool_result` event for the same
   `id`, with `result.code === 'flowchart TD\\nA-->B'` and
   `result.diagram_type === 'flowchart'`.
3. The persisted `messages` row count for the conversation increases
   by exactly 2 (user + final assistant).
4. No `audit_log` row is written (read-only tool).

### 11.2 GREEN

If Phases 2–3 are correct, this test passes without any new code in
the route.

### 11.3 Verification

```
npx vitest run src/app/api/chat/diagram-tool.integration.test.ts
```

Phase 8 lands +1 test (counted as one because it asserts multiple
shape components in a single integration). Cumulative: 302 → 303.

---

## 12. Phase 9 — Manual smoke + bundle measurement

**Goal.** Walk through spec §4 acceptance scenarios 1–9 against
`npm run dev`, and capture the build-output bundle delta required by
spec-QA Issue 5.

**Tasks.**

1. `npm run dev` — open `http://localhost:3000`.
2. Step through scenarios 1, 2, 4, 5, 6, 8 from spec §4 — each must
   match the asserted behavior. Record any divergence in a notes
   buffer for `impl-qa.md`.
3. Scenario 3 (search-first ordering) — record a single trial.
   Acceptable if not deterministic; document.
4. Scenario 7 (workspace switch) — upload a fresh markdown brand,
   ask for its taxonomy diagram, confirm `search_corpus` runs against
   the new workspace.
5. Scenario 9 (no-API-key path) — verify by running the unit test
   subset for `MermaidDiagram` without setting `ANTHROPIC_API_KEY`.
6. **Bundle measurement.** Run:
   ```
   rm -rf .next
   npm run build
   ```
   Record:
   - Total `.next/static` size (pre-Sprint 12 vs. post-Sprint 12).
   - The chunk file containing `mermaid` — note its size.
   - Lighthouse score for the homepage at
     `localhost:3000` (Performance only) — pre vs. post.
7. **Reduced-motion smoke.** In OS settings (Windows: Settings →
   Accessibility → Visual effects → Animation effects = OFF), refresh,
   confirm scenario 6 behavior.

These observations land in `impl-qa.md` in step 6 of the delivery loop.

---

## 13. Phase 10 — Charter §16 + architecture-doc updates

**Goal.** Land documentation in the same commit as the implementation
(charter rule). Phase 10 follows phases 0–8 source changes and the
phase-9 smoke; it precedes the commit.

**Files.**

- Modified: [`docs/_meta/agent-charter.md`](docs/_meta/agent-charter.md)
  - Bump version `1.11 → 1.12` at line 3.
  - §16 prefatory sentence: change "13 sprints (Sprint 0 through Sprint 12)"
    to "14 sprints (Sprint 0 through Sprint 13)."
  - §16 roadmap: rename Sprint 12 to "Diagram Tool + Motion Polish"
    with a one-paragraph summary mirroring the Sprint 11 entry style.
    Add Sprint 13 = "Demo Deployment + README + Loom" with the
    deferred deployment scope (text identical to the prior v1.11
    Sprint 12 entry).
  - Append a v1.12 changelog entry at the bottom of §16 capturing:
    sprint reorder rationale, +N test count delta (locked at end of
    phase 8), bundle-size observation from phase 9, charter
    amendment intent operator-approved in spec-QA dated 2026-05-05.

- Modified: [`docs/_meta/architecture.md`](docs/_meta/architecture.md)
  - Update the `Date:` header to the implementation-commit date (the
    day phase 10 runs). If that day is the same 2026-05-05 the prior
    v1.9 refresh used, the date is unchanged.
  - Module-map: add `src/lib/tools/diagram-tools.ts`,
    `src/components/chat/MermaidDiagram.tsx`.
  - Tool-registry section: add `render_workflow_diagram` row.
  - Sequence-flows section: add a fifth flow — "User asks for a
    diagram → tool registry executes validation → ChatMessage
    renders MermaidDiagram → Motion fade-in." Keep concise.
  - Known-risks section: add bundle-size observation from phase 9.

**Verification.**

```
npm run typecheck
npm run lint
npx vitest run
npm run eval:golden
```

All four must be green. The eval-golden suite has no diagram cases, so
a 5/5 result confirms no regression.

---

## 14. Cumulative verification (final pass before commit)

```
npm run typecheck
npm run lint
npx vitest run
npm run eval:golden
```

Locked test-count expectation: **305 ± 2.** Per phase-by-phase
breakdown in §1.

```
Test Files  X passed (X)
     Tests  303–307 passed (303–307)   # exact number locked post-phase-8
```

If any phase lands a test-count delta different from the §1 table,
the implementer must (a) document the divergence in `impl-qa.md`,
(b) update the cumulative target in §14 before running the final
verification, and (c) confirm the divergence does not indicate a
missed test in an earlier phase.

Lint: pre-existing CRLF↔LF count tracked from pre-flight. New count
must equal old count. Charter v1.10 deferred this debt — Sprint 12
does not address it.

---

## 15. Completion checklist

Before requesting human approval at step 5, all of the following must
hold:

- [ ] `npm run typecheck` green.
- [ ] `npm run lint` count == pre-flight count (no new lint errors
      from this branch).
- [ ] `npx vitest run` green at the locked test count.
- [ ] `npm run eval:golden` 5/5 passing.
- [ ] Each of phases 0–10 has either a test that asserts its delta or
      (for phases 0, 1, 9, 10) a documented manual verification.
- [ ] Phase 9 manual smoke recorded in `impl-qa.md` (step 6 of the
      delivery loop) with bundle-size figures and any divergence
      from acceptance scenarios.
- [ ] Charter v1.12 changelog entry written, version bumped at line 3.
- [ ] Architecture doc dated 2026-05-05 with module-map and
      sequence-flow additions.
- [ ] No file outside the spec / sprint / impl / impl-qa loop modified
      (no drive-by refactors, no unrelated lint cleanups).

---

## 16. Risks (sprint-execution-only; spec-level risks are in spec §8)

1. **Mermaid module side effects in test environment.** Mermaid's
   ESM bundle may attempt to read `document` on import. If the
   `vi.mock('mermaid', ...)` does not fully isolate the import, the
   happy-dom test environment may fail. Mitigation: `vi.mock` at the
   top of every file that imports `MermaidDiagram` indirectly. The
   `MermaidDiagram.test.tsx` mock is direct; the `ToolCard.test.tsx`
   mocks `./MermaidDiagram` itself (one indirection); other files
   should not import the diagram path at all.

2. **`useId()` in test rendering.** React 19's `useId()` returns
   stable IDs per component instance, but Mermaid IDs cannot contain
   `:`. The component strips `:` to `-`. The test must not assert
   the raw `useId()` value.

3. **Motion's first-render flash.** `motion.div` with `initial` props
   may flash visible-then-hidden on hydration if SSR runs without
   the initial state. The diagram component is fully client-side
   (no SSR — `useEffect` only fires client-side), so this risk does
   not apply to `MermaidDiagram`. The `ChatMessage` motion wrap
   *does* run on SSR; if a flash appears in phase 9 smoke, switch
   to `whileInView` or move the motion wrap behind a mounted-state
   guard.

4. **MCP server startup test.** If `mcp/contentops-server.test.ts`
   spawns the server as a subprocess, adding the new tool may
   change its handshake response shape. Confirm by reading the
   test file before phase 3.

5. **Bundle-budget.** If the post-build measurement in phase 9
   shows the homepage chunk increased by more than 200KB gzipped
   from the dynamic-import boundary, the implementation must be
   rechecked: `mermaid` should appear in a separate chunk loaded
   only when a `MermaidDiagram` is mounted. Webpack/Turbopack code
   splitting on `import('mermaid')` is the load-bearing assumption.

---

## 17. What the sprint plan does NOT cover

Per charter §7 step 3, the sprint plan names files and tasks. It does
**not** rewrite the spec, expand scope, or add features beyond the
spec. The following remain explicitly out of scope and will be
rejected if discovered during impl review:

- Any animation surface beyond the three named in spec §3e.
- Any tool input shape beyond raw Mermaid code (no structured-spec
  compiler).
- Any persistence of tool invocations across page reload.
- Any Mermaid theme other than `'neutral'`.
- Any `motion` premium-API usage (LayoutGroup with view-transitions,
  scroll-triggered, draggable, etc.).
- Any new RBAC roles or category beyond `'visualization'`.
- Any change to the eval-harness, the rate limit, or the spend
  ceiling.

---

**End of sprint plan. Awaiting human QA per charter §7 step 4.**
