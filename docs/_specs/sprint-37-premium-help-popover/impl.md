# Sprint 37 — Implementation Notes & QA Report

Premium FAB help popover. Spec: [`spec.md`](spec.md). Phased 37.1 → 37.5; gate each.

## Sprint 37.1 — No-lease polish + state-aware placeholder

Pure-presentation pass on the no-lease compact panel so it reads as a designed help popover, not a
prototype. Six cohesive changes:

- **State-aware composer placeholder.** `ChatComposer` gains an optional `placeholder` prop (default =
  the lease-context `Ask about a clause, request a rewrite…` string, so the Sprint 23c contract holds);
  `ChatUI` forwards `composerPlaceholder`; the FAB passes `Ask a general question…` when no lease is
  attached. The clause/rewrite affordance no longer shows before a lease exists (Don Norman: signifiers
  match available actions). — `ChatComposer.tsx`, `ChatUI.tsx`, `AssistantFab.client.tsx`.
- **Dropped the duplicate title.** The compact empty state rendered an `<h3>LeaseLens Assistant</h3>`
  that duplicated the drawer chrome header — removed (Dieter Rams). The body is now just the one-line
  orienting subhead (`text-balance`, tightened `py-6`→`py-4`). — `ChatTranscript.tsx`.
- **Lighter "Using:" row.** With no lease the context bar drops its hard divider band + tightens padding
  so it reads as a quiet caption secondary to the upload CTA/body (Refactoring UI: weight = priority).
  Value stays `text-fg-muted` for WCAG-AA contrast — "less dominant" via divider/weight, not contrast.
- **Warm `--shadow-popover`.** New token in `globals.css` `@theme`: three palette-tinted layers (warm
  brown `40 28 16`) — contact + ambient + lift — so the floating card feels premium, not like a generic
  black `shadow-lg` modal. Applied to the drawer with the existing hairline border.
- **Elegant chip scale.** Suggestion chips `py-2.5`→`py-2`, `px-3`→`px-3.5` — a refined pill, not the
  oversized 36.6 tap target.
- **Compact height 580 → 520.** 36.6 had bumped 480→580 because the tall duplicate-title hero clipped;
  with that title gone the body is just the ~74px subhead, so 520px fits with no clip and leaves
  headroom for the 37.2 Upload CTA — still well under the 720px workspace.

**Tests (TDD / pinned-contract updates):** +2 `ChatComposer` (default vs custom placeholder); +2
`AssistantFab.integration` (no-lease general placeholder; lease keeps default); +1 `AssistantFab.client`
(context bar divider by lease state); updated the 36 shadow assertion (`shadow-popover`, not
`shadow-lg`/`xl`), the 36.6 chip assertion (`py-2`), the compact-size assertion (`520/74vh`), and the
`ChatTranscript`/`29.2` duplicate-title assertions (now assert the orienting subhead + no body heading).
Suite **1167 → 1172** (+5); chat suite 195.

**Gates:** lint ✓ · typecheck ✓ · test 1172 ✓ · build ✓.
**Live (Playwright, no-lease compact panel):** `data-display-mode="compact-help"`, drawer 520px (top
168px, fully in view); transcript `scrollHeight 89 ≤ clientHeight 89` (**no clip**); composer
placeholder `Ask a general question…`; exactly one heading in the drawer (the chrome wordmark — no
duplicate); context bar has no `border-b`; warm 3-layer `rgba(40,28,16,…)` shadow confirmed computed; 0
console errors. Screenshot: [`s37.1-no-lease-popover.png`](screenshots/s37.1-no-lease-popover.png).

## Sprint 37.2 — DROPPED

Mid-implementation the user decided the chat should have **no upload control** — the lease is never
dropped into / uploaded from the conversation; the hero dropzone is the sole upload surface
(parser-first). The planned in-chat "Upload a lease" CTA + `uploadDropzoneRef`/spotlight plumbing was
removed before any of it landed (one started edit reverted; tree stayed green). The assistant guides
toward the dropzone with **text only** (37.4). Revised decision recorded in [`spec.md`](spec.md) #4.

## Sprint 37.3 — `landing-chat` growth + "Read in full view" expanded reading

Right-sizes the no-lease assistant to engagement, and gives long answers a reading mode instead of
cramming the compact popover.

- **New `landing-chat` display mode.** Derivation (all local to `AssistantFab.client`, context boundary
  intact): `expanded&&canExpand → expanded-reading; lease → workspace; !lease && hasAskedQuestion →
  landing-chat; else compact-help`. `landing-chat` is `460×620` — grown "slightly" from compact
  `420×520` for readable answers, still well under the `720` workspace. The FAB learns `hasAskedQuestion`
  from a new boolean-only `onHasMessagesChange` callback out of `ChatUI` (message state stays owned by
  ChatUI; no context coupling).
- **Expand unlocked pre-upload.** The header expand toggle now renders whenever `canExpand`
  (`lease || hasAskedQuestion`), not lease-only — so a landing-chat user can pop into reading mode. A
  `canExpand` guard on the derivation prevents a stale `expanded` from stranding a bare help card large.
- **"Read in full view".** A long assistant answer (`> 600` chars) renders a `message-read-in-full`
  affordance that switches the drawer to `expanded-reading` (progressive disclosure). Threaded
  FAB → ChatUI (`onRequestExpandedReading`) → ChatTranscript → ChatMessage; the FAB passes it only when
  **not** already expanded, so it self-hides in reading mode.
- **Tests:** +4 `ChatMessage` (long→button, short→none, no-callback→none, user-msg→none); +2
  `AssistantFab.integration` (thread→landing-chat + expand visible; long answer→expanded-reading + hide).

## Sprint 37.4 — structured answers (context-scoped system prompt)

Adds a `noLeaseAnswerStyleSection` to `buildSystemPrompt`, included **only when no lease is loaded**
(`activeLease ? null : …`, filtered out at join). It asks for tight summary → numbered steps → a
one-line **text** CTA inviting upload via the **page's dropzone** ("not the conversation" — never
implies chat-upload), and references the "Read in full view" affordance so the model can be concise.
Scoped so the tuned scan / draft-email / citation rules are untouched once a lease attaches.
- **Tests:** +3 `system-prompt` (no-lease includes the section + dropzone CTA; lease excludes it, no
  stray "null"; scan/draft/citation rules present in both states).

## Sprint 37.5 — motion + accessibility polish

- **Chip stagger.** The suggestion chips reveal with a subtle 60ms stagger (`EASE_OUT_SOFT`, small rise),
  mirroring `ChatEmptyState`. Reduced-motion users get them instantly (`initial={false}`, no item
  variants); a `data-motion` attribute records the path. +1 integration test pins the reduced path.
- **A11y.** New controls are accessible by construction and verified: expand toggle keeps its
  `aria-label`/`aria-pressed` in landing-chat (live: "Expand/Collapse assistant", pressed flips);
  "Read in full view" is a labelled `<button>` with a focus ring + `aria-hidden` icon. Escape-to-close,
  focus-into-panel, focus-return-to-pill, and `inert`-when-closed are mode-agnostic (key on `fab.state`)
  so the existing Sprint 29.x tests still cover them across the new modes.

## Final verification (whole sprint)

- **Gates:** lint ✓ · typecheck ✓ · **test 1182 ✓** (1172 → 1182, +10 net across 37.3/37.4/37.5) ·
  build ✓.
- **Live (Playwright, no-lease landing FAB):** compact-help `420×520` (placeholder "Ask a general
  question…", no duplicate title, quiet caption, no clip, no expand button) → ask a question → grows to
  `landing-chat 460×620` with the expand toggle → expand → `expanded-reading 820×…` (`aria-pressed=true`)
  → a long answer shows "Read in full view" → click → `expanded-reading` + affordance hides. **0 console
  errors.** Screenshots: [`s37.1-no-lease-popover.png`](screenshots/s37.1-no-lease-popover.png),
  [`s37.3-landing-chat.png`](screenshots/s37.3-landing-chat.png).
- **Non-regression note:** in dev, "Reset workspace" clears the *client* lease but the seeded
  conversation stays lease-bound *server-side*, so a chat turn after reset answers about the old lease
  and the system prompt takes the lease branch (37.4's no-lease styling can't be exercised through that
  stale conversation live). This is a pre-existing dev reset client/server-sync quirk, not a 37.x
  regression; 37.4's scoping is covered by unit tests.

## How to re-verify locally
```bash
npm test src/components/chat/ src/lib/chat/system-prompt.test.ts   # green
npm run lint && npm run typecheck && npm run build   # build only when no dev server is live
# Live: npm run dev → Replace → "Reset workspace" → open "Help":
#   compact-help 420×520: no duplicate title, "Ask a general question…" placeholder,
#     quiet "Using:" caption, warm shadow, staggered chips, no clipped subhead, no expand button.
#   ask a question → grows to landing-chat 460×620 + the expand toggle appears.
#   expand → expanded-reading 820×… ; a long answer shows "Read in full view" → expanded-reading.
```
