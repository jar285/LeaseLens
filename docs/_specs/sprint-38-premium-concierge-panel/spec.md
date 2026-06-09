# Sprint 38 — Premium LeaseLens Assistant Concierge Panel

> Method: `docs/_architecture/development-philosophy.md` (Spec → QA-spec → Sprint → TDD → Code → QA).
> Lenses: `docs/_architecture/power-words.md` + `ui-ux-design-philosophy.md`.
> Builds on Sprint 37 (uncommitted). No commits until the user says so.

## What we are building

A visual/material/identity redesign of the FAB assistant so it reads as a **warm editorial legal-tech
concierge panel** that belongs to LeaseLens — not a generic chat widget. It keeps the parser-first
product direction: the assistant is a *supporting* surface; upload/parse/red-flags stays primary.

## Who it's for & the problem

Tenants using the NJ lease parser. The current FAB works but still reads prototype-ish: FAB and panel
feel disconnected, too many hard divider lines, plain header, a debug-like "USING:" row, a functional
(not premium) empty state, outline-y chips, a generic input, and open/close that could feel more
intentional.

## Locked decisions (Spec-QA gate, 2026-06-03)
1. **No upload control in the chat.** The empty state / status mentions uploading via the page's
   dropzone as **informational text only** — never a button or in-chat upload. (Consistent with the
   decision that dropped Sprint 37.2.) The hero dropzone stays the sole upload surface.
2. **More visible glass** — translucent warm parchment + noticeable `backdrop-blur` + inner top
   highlight. **Hard guardrail:** body/answer text must hold **WCAG-AA (≥4.5:1)** — the content layer
   stays opaque enough for that even where the chrome shows translucency. Verified live.

## Relationship to Sprint 37 (avoid redoing)
**Already done in 37 — do NOT redo:** draft/conversation/selection state survives close→open (Sprint 27);
state-aware composer placeholder; lighter "Using:" row; warm `--shadow-popover`; unified footer card +
polished/staggered chips; context-sized modes (compact-help / landing-chat / workspace / expanded);
"Read in full view"; open/close + resize motion; Escape/focus-return/inert.
**Sprint 38 supersedes these specific 37 choices:** single-line header → branded two-line header with
icon; `rounded-lg` (8px) → `rounded-3xl` (24px); opaque `bg-surface-card` → translucent parchment +
backdrop-blur + inner highlight; "Using:" eyebrow caption → a **status pill** (`○ No lease attached` /
`● Lease attached: <file>`); remaining header/context hard dividers reduced; open motion adds a 12px
rise; FAB gets a refined gradient + inner highlight + states. Composer placeholder copy updated.

## Component states (Material Design lens — every state is real & designed)
`closed` · `opening` · `open` · `closing` · input `empty` (send disabled) · input `draft` ·
`sending`/streaming (send shows loading, locked) · `error` (visible, not hidden) ·
`no-lease` (status pill `○`, general placeholder, onboarding chips) ·
`lease-attached` (status pill `● <file>`, lease placeholder, Q&A chips).

## Visual design requirements (Wathan/Schoger + Rams)
- **Panel:** `rounded-3xl` (24px); translucent warm parchment (`surface-card` at reduced opacity) +
  `backdrop-blur`; thin `border-border-hairline`; **inner top highlight** (1px inset light line) for
  material depth; warm layered `--shadow-popover`. Reduce hard dividers — lead with spacing + surface
  changes; keep at most one quiet separator above the footer.
- **Header (identity):** small LeaseLens mark + **"LeaseLens Assistant"** (serif) over a muted
  **"NJ tenant-law guidance"** subtitle; **circular** icon close button (hover/focus/keyboard).
- **Status pill (replaces "USING:"):** soft pill — no lease: hollow `○` dot + "No lease attached" +
  a quiet text hint to upload in the dropzone; lease: filled `●` + "Lease attached: <filename>". Dot is
  paired with text (never color-only — WCAG).
- **Empty state:** premium, calm copy ("No lease uploaded yet" + one short helpful paragraph, ending in
  text guidance to upload via the dropzone). Informational, never legal advice.
- **Chips:** soft-fill rounded pills (subtle background + border + hover lift + focus ring + pressed),
  not bare outlines; keyboard accessible; staggered reveal (from 37.5).
- **Composer (command bar):** circular send button with empty-disabled / sending / focus states;
  placeholders — no lease: "Ask a general question about NJ leases…", lease: "Ask about a clause, fee,
  deposit, or red flag…".
- **FAB:** coral/terracotta brand, refined gradient or solid + subtle inner highlight + soft shadow;
  rounded pill (icon + label on lg, icon-only on mobile); hover lift, pressed, focus ring; ≥44px touch.

## Motion requirements (Apple HIG; reduced-motion respected)
- **Open:** opacity `0→1`, scale `0.96→1`, translateY `12px→0`, ~`180ms`, `cubic-bezier(0.22,1,0.36,1)`,
  origin near the FAB so it reads as expanding from the pill. **Close:** reverse (hide, not destroy).
- **Reduced-motion:** simple fade or none; no transform. Hover/press lifts disabled under reduced-motion.
- Calm, never bouncy or decorative (Rams).

## Accessibility requirements (WCAG)
Keyboard-operable throughout (open, chips, composer, expand, close, Escape-to-close); visible focus
rings; semantic `<button>`s with accessible labels (circular close, send, FAB); status changes
announced to SR where meaningful; **body/answer text ≥4.5:1 contrast even over the glass**; never rely
on color alone (status dot + text); reduced-motion honored; comfortable touch targets (≥44px).

## Testing requirements (Kent C. Dodds / Testing Library — behavior, not internals)
Open the assistant; close it; type a draft; close→reopen preserves the draft; chips are keyboard
reachable + activatable; send disabled when input empty; Escape closes; no-lease shows the `○` status +
general placeholder; lease-attached shows `● <file>` + lease placeholder; focus returns to the FAB on
close. Reuse the existing FAB/integration suites; add only what the new identity/status pill needs.

## Variance / Invariance
- **Variance:** exact parchment opacity/blur radius, header layout spacing, pill styling, FAB gradient
  stops, chip fill — all tunable to hit the look + contrast.
- **Invariance:** parser-first (assistant stays secondary; page never becomes chat-first); no in-chat
  upload control; no broken upload/parser; errors stay visible; no skipped tests; no invented APIs; the
  `AssistantFabContext` boundary holds (display state stays local); WCAG-AA body text; reduced-motion.

## Definition of done
Premium, integrated, trustworthy panel matching the warm editorial brand; FAB↔panel connected via
placement + motion; branded header; clear no-lease state; soft-fill chips; command-bar input; all states
designed (hover/active/focus/disabled/loading); state preserved on close; keyboard + reduced-motion +
WCAG-AA verified; tests/lint/typecheck/build pass; QA report per sprint; no parser-first drift.

## Sprint breakdown (small, one purpose each)
- **38.1 — Structure & State audit + guard tests.** Confirm (don't rebuild) open/closed vs content
  ownership; add/strengthen behavior tests for draft-survives-close→open, Escape-close, focus-return,
  send-disabled-when-empty, no-lease vs lease status. (Mostly verification + test hardening.)
- **38.2 — Premium panel layout (material + identity).** 24px radius + translucent parchment +
  backdrop-blur + inner highlight + reduced dividers; branded two-line header + circular close; status
  pill (`○`/`●`); premium empty-state copy (text upload guidance); soft-fill chips; command-bar input +
  placeholder copy. Behavior unchanged. WCAG-AA contrast guardrail verified.
- **38.3 — Motion & interaction polish.** Open/close per the motion spec (add 12px rise, 180ms, the
  easing); FAB gradient + hover/press/focus states + inner highlight; reduced-motion fallbacks; make
  FAB↔panel feel connected.
- **38.4 — Accessibility & QA.** Keyboard, focus management, labels, contrast (incl. glass), mobile,
  reduced-motion sweep; full gate (lint/typecheck/test/build) + live Playwright + screenshots + QA report.

## Self-QA of this spec (development-philosophy Step 3)
- **Missing?** Dark-mode parchment/blur values + dark contrast must be checked too (added to 38.2/38.4).
  Error state styling is preserved from ChatUI (already visible) — 38.2 must not hide it.
- **Unrealistic?** "More visible glass" + WCAG-AA is a real tension over the busy landing — mitigated by
  keeping the content layer opaque enough; if a given blur fails AA, opacity wins (invariant).
- **Drift risk?** The biggest risk is the panel creeping toward "chat-first." Held by: assistant stays
  secondary, no upload control, parser surfaces untouched (invariant).
- **Duplication?** Reuse `LeaseLensMark`, `--shadow-popover`, motion presets, existing modes/persistence
  — 38 is a skin+identity layer, not a rewrite (Martin Fowler: behavior-preserving).
