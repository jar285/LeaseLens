# Sprint 15 — Chat-Surface UI Polish (Token-First Redesign)

**Status:** Draft, awaiting human QA per charter §7 step 1.
**Date:** 2026-05-08.
**Charter version at draft time:** 1.13 (no amendment required for this sprint).

---

## 1. Problem

The post-Sprint-14 LeaseLens chat surface works end-to-end but reads as utilitarian. Concrete weaknesses observed in the cockpit walkthrough:

1. **Indigo from Tailwind's default scale is the only accent**, applied across primary action, soft hover backgrounds, focus rings, role-tab active state, sparkle icon, and citation chip — too much surface area, no visual hierarchy between "this is the primary action" and "this is decoration".
2. **Body type is the system stack.** No editorial typography for the empty-state H1, no tabular-nums for numeric badges, no consistent font feature settings.
3. **Motion is sparse and inconsistent:** ChatMessage entry animates (250ms y-slide), ToolCard expand animates (220ms height), MermaidDiagram fade animates (350ms scale), but every other surface — composer focus, role-tab active swap, dropzone dragover, RedFlagReport item entry — is either an instant CSS class swap or no transition at all.
4. **No dark-mode support.** `color-scheme: light` is hard-coded. A user with `prefers-color-scheme: dark` gets a glaringly bright reading surface.

The product audience — tenants under stress reading legal text — needs a calmer, more trustworthy feel. The reference set is Linear, Anthropic Console, Apple Notes, and Stripe Apps, *not* Vercel landing-page hero or particle effects.

This sprint introduces a token-first design system, normalises motion to a small palette of durations and easings, and ships system-preference dark-mode parity. Component prop signatures and exported names stay frozen so existing tests and call sites keep working.

Out of scope: business logic, streaming wire format, eval harness, RedFlag severity-grading behaviour, MCP server, route handlers. The brief is explicitly "visual + motion layer only."

---

## 2. Invariants

These hold regardless of implementation choices below.

1. **No new runtime deps.** `motion@^12` and `lucide-react` cover every animation and icon need. `next/font/google` is part of the Next.js framework — not a new dep. shadcn/ui, cmdk, and 21st.dev components are out of scope for this sprint.
2. **Component public surface is frozen.** Every component named in §3 keeps its current path, exported name, and props signature. Internal refactors that change rendering are fine; renames are not. This preserves call sites and ~90% of existing tests.
3. **Reduced-motion respect is non-negotiable.** Every new motion site uses the existing `useReducedMotion()` + DOM-swap pattern from [ChatMessage.tsx](../../../src/components/chat/ChatMessage.tsx), [ToolCard.tsx](../../../src/components/chat/ToolCard.tsx), [MermaidDiagram.tsx](../../../src/components/chat/MermaidDiagram.tsx). When `prefers-reduced-motion: reduce` is set, animations are *skipped entirely* (plain DOM rendered) — never just slowed.
4. **WCAG AA contrast on body text in both schemes.** Token values are chosen so foreground/background contrast clears AA on every chat-surface text size. Verified via Lighthouse a11y audit.
5. **Dark mode is system-preference-only.** No manual switcher. `<html>` carries `colorScheme="light dark"`; every component grows `dark:` Tailwind variants alongside the light defaults. No JS toggle, no cookie.
6. **Single source of design truth.** All colour, typography, radius, shadow, and motion values live in the `@theme` block in [globals.css](../../../src/app/globals.css). Components consume tokens via Tailwind v4 utilities (`text-accent-600`, `bg-neutral-50`, `shadow-hairline`, `duration-motion-150`) — never raw hex or arbitrary values.
7. **No structural layout changes.** The three-pane workspace shell (left ~280px / centre 1fr / right ~320px) stays as-is. The header (LeaseLens link, workspace switcher, role tabs) stays as-is. The composer + transcript + empty-state arrangement inside the centre pane stays as-is. Visuals and motion only.
8. **Test count never decreases.** Pre-sprint baseline is 507/507. Post-sprint expects ≥ 507. One assertion churn is acknowledged for the "Drop the PDF to upload" → "Drop to scan" copy change in `LeaseUploadDropzone.test.tsx` (Phase 7).
9. **Charter §6 (simplicity).** No abstraction is introduced beyond what the brief calls for. No design-system package, no theme provider, no styled-components layer. Just tokens in `@theme` + Tailwind utilities + `motion` primitives.

---

## 3. Design system

### 3a. Tokens (the `@theme` block)

The Tailwind v4 `@theme` block in [globals.css](../../../src/app/globals.css) is the single source. Tailwind auto-generates utility classes from `--color-*`, `--font-*`, `--radius-*`, `--shadow-*`, `--ease-*`, `--animate-*` keys.

#### Color (warm-neutral + accent)

```css
@theme {
  /* Neutral — warm grey, not pure grey-500. Mapped to "neutral-*". */
  --color-neutral-50:  #FAFAF9;   /* page background, light */
  --color-neutral-100: #F4F4F2;
  --color-neutral-150: #ECECE8;
  --color-neutral-200: #E2E2DC;
  --color-neutral-300: #C9C9C0;
  --color-neutral-400: #A3A39A;
  --color-neutral-500: #75756B;
  --color-neutral-600: #565650;
  --color-neutral-700: #3F3F3A;
  --color-neutral-800: #28282A;   /* dark surfaces */
  --color-neutral-900: #1A1A1C;
  --color-neutral-950: #0E0E10;   /* page background, dark */

  /* Accent — soft violet, keyed on the brief's #6E5CE6 */
  --color-accent-50:   #F2EFFD;
  --color-accent-100:  #E6E0FB;
  --color-accent-200:  #CFC4F7;
  --color-accent-300:  #B0A0F1;
  --color-accent-400:  #8A77EB;   /* hover / focus ring */
  --color-accent-500:  #6E5CE6;   /* primary brand */
  --color-accent-600:  #5A47DC;   /* primary action */
  --color-accent-700:  #4B3AC0;   /* primary action hover */

  /* Semantic */
  --color-success-100: #DDF4E6;
  --color-success-600: #1F8B4C;
  --color-warning-100: #FCF1D6;
  --color-warning-600: #B07410;
  --color-danger-100:  #FBDFDF;
  --color-danger-600:  #B33232;
  --color-info-100:    #DBEEFD;
  --color-info-600:    #1E6FB8;

  /* Surface-role aliases (consumed by body + cards) */
  --color-surface-base: var(--color-neutral-50);
  --color-surface-card: #FFFFFF;
  --color-fg-default:   var(--color-neutral-900);
  --color-fg-muted:     var(--color-neutral-500);
  --color-border-hairline: rgb(0 0 0 / 0.08);
}
```

The **dark companions** flip the surface aliases inside a media query — Tailwind v4 preserves authored CSS in `@media (prefers-color-scheme: dark)`:

```css
@media (prefers-color-scheme: dark) {
  @theme {
    --color-surface-base: var(--color-neutral-950);
    --color-surface-card: var(--color-neutral-900);
    --color-fg-default:   var(--color-neutral-100);
    --color-fg-muted:     var(--color-neutral-400);
    --color-border-hairline: rgb(255 255 255 / 0.08);
    /* Accent shifts slightly desaturated for OLED comfort */
    --color-accent-500: #8576E8;
    --color-accent-600: #6E5CE6;
    --color-accent-700: #5A47DC;
  }
}
```

For per-class `dark:*` Tailwind variants (used component-side), the `<html>` element gets a `dark` class injected by Tailwind v4's media-query strategy. Components author `dark:bg-neutral-900 dark:text-neutral-100` style overrides where the theme aliases aren't sufficient.

#### Typography

```css
@theme {
  --font-sans:  var(--font-geist-sans), system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-serif: var(--font-source-serif), Georgia, "Times New Roman", serif;
  --font-mono:  var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace;
}
```

Body sets `font-feature-settings: "ss01", "cv11"` (Geist's small caps + alt 6/9 glyphs). Numeric contexts add `.tabular { font-variant-numeric: tabular-nums; }`.

#### Radii

```css
@theme {
  --radius-sm:  4px;
  --radius-md:  6px;
  --radius-lg:  8px;
  --radius-xl:  10px;
  --radius-2xl: 12px;
  --radius-3xl: 16px;
}
```

#### Shadows

```css
@theme {
  --shadow-hairline: 0 0 0 1px var(--color-border-hairline);
  --shadow-lift:     0 2px 8px rgb(0 0 0 / 0.06);
}
```

No drop-shadow-bloom shadow tokens. Cards lift by translating Y (motion), not by growing a shadow halo.

#### Motion

```css
@theme {
  --motion-90:  90ms;
  --motion-120: 120ms;
  --motion-150: 150ms;
  --motion-200: 200ms;
  --motion-220: 220ms;
  --motion-250: 250ms;
  --motion-350: 350ms;

  --ease-out-soft:    cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out-soft: cubic-bezier(0.45, 0, 0.55, 1);
}
```

Spring physics for `motion`'s `transition={{ type: 'spring' }}` are NOT tokenised — they're motion-library-specific. Use `{ stiffness: 300–500, damping: 25–30 }` consistently.

### 3b. Component refactor scope

Every component in this list keeps its file path, exported name, and props signature. Internal rendering changes only.

| Component | Path | Phase | What changes |
|---|---|---|---|
| `RoleSwitcher` | [src/components/auth/RoleSwitcher.tsx](../../../src/components/auth/RoleSwitcher.tsx) | 2 | Animated pill underlay via `motion.div` + `layoutId`; token swap |
| `WorkspaceHeader` | [src/components/cockpit/WorkspaceHeader.tsx](../../../src/components/cockpit/WorkspaceHeader.tsx) | 2 | Token sweep, tabular-nums on counts, tighter padding |
| `ChatEmptyState` | [src/components/chat/ChatEmptyState.tsx](../../../src/components/chat/ChatEmptyState.tsx) | 3 | Serif H1, sparkle 4s loop, staggered card entry |
| `ChatComposer` | [src/components/chat/ChatComposer.tsx](../../../src/components/chat/ChatComposer.tsx) | 4 | Focus border crossfade, send-button spring, sr-only hint |
| `AttachButton` | [src/components/chat/AttachButton.tsx](../../../src/components/chat/AttachButton.tsx) | 4 | Loader2 progress ring during parse |
| `ChatMessage` | [src/components/chat/ChatMessage.tsx](../../../src/components/chat/ChatMessage.tsx) | 5 | Per-token streaming fade |
| `ChatTranscript` | [src/components/chat/ChatTranscript.tsx](../../../src/components/chat/ChatTranscript.tsx) | 5 | Tighter rhythm; token swap |
| `TypingIndicator` | [src/components/chat/TypingIndicator.tsx](../../../src/components/chat/TypingIndicator.tsx) | 5 | Accent token recolour |
| `ToolCard` | [src/components/chat/ToolCard.tsx](../../../src/components/chat/ToolCard.tsx) | 6 | Hairline border, 2px hover lift, semantic-token badges |
| `LeaseUploadDropzone` | [src/components/lease/LeaseUploadDropzone.tsx](../../../src/components/lease/LeaseUploadDropzone.tsx) | 7 | Dragover dashed→solid, copy swap, icon pulse |
| `RedFlagReport` | [src/components/lease/RedFlagReport.tsx](../../../src/components/lease/RedFlagReport.tsx) | 8 | Slide-in items, header pulse, semantic severity bars |
| `CitationChip` | [src/components/lease/CitationChip.tsx](../../../src/components/lease/CitationChip.tsx) | 8 | Token recolour (low-priority, inline pill) |

`MermaidDiagram` and `LeaseLensWorkspaceShell` are intentionally **not** in this list — their current implementation already hits the brief's bar.

### 3c. 21st.dev / shadcn posture

Skipped. Brief invited proposals; my read is that hand-rolled with `motion`'s `layoutId` (tabs) + staggered keyframes (cards) + the existing `animate-bounce` (typing dots) clears the bar with zero new dep surface. Honours the brief's "no new heavy deps" constraint.

---

## 4. Acceptance criteria

Manual walk through `http://localhost:3000` with the seeded sample lease loaded.

1. **AC #1 — Empty state.** Land on `/`. The H1 "LeaseLens — NJ Tenant Law" renders in Source Serif 4 at ≥ 36 px on desktop. The four starter cards stagger in (60ms apart, 24ms duration each) on first paint. The sparkle icon barely-pulses on a 4-second loop. Hovering a card darkens its border and nudges the icon 2px right.
2. **AC #2 — Role tabs.** Click between Tenant / Reviewer / Admin. The active-pill underlay slides between positions over ~150ms (spring). No flash, no overlap. Inactive labels fade slightly. Keyboard focus shows a visible accent ring.
3. **AC #3 — Composer focus.** Click the textarea. The container border crossfades to accent over ~120ms. Hover the send button — it scales 1.05 with a soft spring, drops back on release. Send a message — the spring releases cleanly, no jank.
4. **AC #4 — Streamed tokens.** Send a question. Newly-arrived tokens fade in over 50ms each as the response streams. No typewriter clack, no flicker. Settled text reads as plain.
5. **AC #5 — ToolCard.** Hover any tool card — it lifts 2px over 150ms (spring). Click expand — content height animates open over 220ms. The card has a hairline border, no drop-shadow halo.
6. **AC #6 — Dropzone dragover.** Drag a PDF over the left pane. Border becomes solid accent (was dashed grey). Inner copy swaps to "Drop to scan." Icon pulses once. Drop and release — uploading state.
7. **AC #7 — Red-flag items.** Run the standard scan. As gradings complete, items slide in from the right with an 8px offset (spring). The "RED FLAGS" panel header pulses once on each new item. New severity bars use semantic tokens (red-600 high, amber-600 medium, sky-600 low, emerald-600 ok).
8. **AC #8 — System-pref dark mode.** DevTools → Rendering → emulate `prefers-color-scheme: dark`. Every chat-surface element flips cleanly. Body text reads at AA contrast. Accent stays roughly the same hue (slight desaturation acceptable).
9. **AC #9 — Reduced motion.** DevTools → Rendering → emulate `prefers-reduced-motion: reduce`. Walk the same flow. Sparkle loop, card stagger, role-pill animation, dropzone pulse, item slide-in, send-button spring all disappear. DOM is the plain branch (no slowed animations). Streaming-token fades disappear (text just appears).
10. **AC #10 — Test sweep.** `npm run test` — 507+/507+ pass; `npm run typecheck` green; `npm run lint` 0 errors; `npm run build` succeeds.
11. **AC #11 — Lighthouse.** Lighthouse a11y score ≥ 95 on `/` in both colour schemes.

---

## 5. Out of scope

- Manual dark/light theme switcher (system-pref only this sprint).
- 21st.dev / shadcn / cmdk introduction.
- Any change to the chat tool-use loop, streaming, RAG, or eval harness.
- Right-pane RedFlag *behaviour* changes — only the visual layer.
- Sample-lease "Use sample lease" CTA, in-app Tier 2 button, paste-text fallback (deferred to Sprint 16's deploy + polish bundle, captured in [`impl-qa.md` of sprint-13-leaselens](../sprint-13-leaselens/impl-qa.md)'s Sprint 15 section).
- Mobile-responsive layout work — three-pane shell stays desktop-optimised this sprint.
- New animations on `MermaidDiagram` or `LeaseLensWorkspaceShell` (current state hits the bar).

---

## 6. Charter compliance

- **§4 invariants:** unaffected — no tool surface, RAG, audit, or streaming changes.
- **§5 hard requirements:** unaffected.
- **§5.6 RBAC:** unchanged. The role-tab visual change does not alter the registry filter or route guards.
- **§6 simplicity:** the design-system pattern is contained in one CSS block + Tailwind utility consumption. No theme provider, no design-system package.
- **§7 spec-first:** this spec ships before code edits per the workflow.
- **§11b demo guardrails:** unaffected.
- **§15a Context7:** Tailwind v4 `@theme` block syntax and `next/font/google` Geist + Source Serif 4 imports verified against current Tailwind / Next.js docs before sprint start.

---

**End of spec.**
