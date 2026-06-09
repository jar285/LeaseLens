# Sprint 36 — Context-sized FAB assistant (compact-help / workspace / expanded-reading)

> Approved plan. The user's full "Landing Page FAB + Assistant UX Refactor" spec is the source intent;
> this is the engineering-scoped version after cross-referencing the code.

## Context

User feedback: on the **landing page (no lease)**, clicking the FAB opens the full reading drawer that
competes with the hero/upload CTA and shows a large empty body. The assistant should be **right-sized to
context** — compact before upload, contextual after, expandable for long answers — while the
parser/upload flow stays the main product.

**Cross-reference finding: ~70% already shipped** (Sprint 29 + 33.A.2): the "Help"/"Ask about lease"
pill label, no-lease onboarding chips + subhead, the `emptyStateVariant="compact"` body, the context
bar, and the full a11y/persistence machinery (role=dialog, aria-modal, Escape→close, focus-on-open,
focus-return-to-pill, 44px close, inert-when-closed, draft/thread persistence) all exist.

**The one real gap:** the drawer is a **single fixed size** regardless of context
([AssistantFab.client.tsx:356-358](../../../src/components/chat/AssistantFab.client.tsx#L356-L358)) —
`h-[min(720px,80vh)] w-[min(560px,…)] lg:w-[min(620px,…)]` with a heavy `border border-neutral-200` +
`shadow-xl`. So "Help" opens the big workspace drawer on the landing page.

## Decisions (locked at gate)
- **Scope:** full three-mode (compact-help / workspace-drawer / expanded-reading) incl. an
  expand/collapse toggle.
- **`expanded` is local `useState`** in `AssistantFab.client.tsx`, NOT a context field — it's pure
  presentation; the drawer DOM + ChatUI instance persist across re-render, so resize never resets
  messages/draft/selection. Keeps the `AssistantFabContext`/`ChatStreamContext` boundary intact.
- **Derive `displayMode`** from `activeLease` (compact-help when null) + `expanded` (expanded-reading) →
  else workspace-drawer. Don't add states to `AssistantFabState` (`'menu'` stays vestigial).
- **Resize is instant** (no transition) — sidesteps reduced-motion; optional polish later.

## Build (all in `AssistantFab.client.tsx`)
1. `const [expanded, setExpanded] = useState(false)`; reset to `false` in the existing focus effect's
   `next === 'closed'` branch.
2. `type DisplayMode = 'compact-help' | 'workspace-drawer' | 'expanded-reading'` derived after `chips`.
3. Per-mode size lookup on the drawer container, + `data-display-mode={displayMode}` test hook:
   - compact-help → `w-[min(420px,calc(100vw-3rem))] h-[min(480px,70vh)]`
   - workspace-drawer → today's `w-[min(560px,…)] lg:w-[min(620px,…)] h-[min(720px,80vh)]` (no regression)
   - expanded-reading → `w-[min(720px,…)] lg:w-[min(820px,…)] h-[min(900px,92vh)]`
   - shared mobile suffix → `max-sm:w-[calc(100vw-2rem)] max-sm:h-[min(85vh,calc(100vh-7rem))]`
4. Expand/Collapse header button (lease-only), before the close button: `assistant-fab-expand`,
   `aria-label` expand/collapse, `aria-pressed`, reuse close-button class recipe (44px). Icons
   `Maximize2`/`Minimize2`.
5. Visual lightening: drop `border border-neutral-200 … dark:border-neutral-800` + `shadow-xl`; add
   `shadow-hairline shadow-lg` (token auto-flips dark).
6. Compact body: no change (compact variant already wired; height shrink closes the empty-body issue).

## Tests (TDD, `AssistantFab.client.test.tsx`)
no-lease→compact size; lease→workspace size (no-regression); expand→expanded size; expand preserves
prefill; expand button absent w/o lease; expand button 44px + aria-label/aria-pressed; focus-return
post-expand; Escape post-expand; mobile safe class; lighter-border class. + context negative guard
(no `expanded`/`displayMode` keys on context value).

## Verification
Gates (lint/typecheck/test/build) + live Playwright (landing compact / lease workspace / expand grows &
preserves thread / mobile safe sheet) → screenshots + impl.md.

## Commit
`feat(s36): context-sized FAB assistant …`. No commit/push until the user says so.
