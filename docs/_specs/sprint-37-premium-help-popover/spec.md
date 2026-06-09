# Sprint 37 — Premium FAB Assistant Help Popover

> Approved plan (2026-06-03). Source intent: the user's "LeaseLens FAB Assistant Premium Help Popover
> Refinement" brief. This is the engineering-scoped, phased version after cross-referencing the code.

## Goal

Make the landing-page FAB assistant feel like a **premium contextual help popover**, not a prototype
chat panel: compact + elegant before upload, contextual after upload, expanded only for reading long
answers — while the upload CTA stays the primary action and the assistant guides the user toward it.
Lenses: Don Norman, Nielsen, Krug, Refactoring UI, Dieter Rams, WCAG, React state-ownership.

## Locked decisions (Spec-QA gate)
1. **Phased delivery 37.1 → 37.5**, each a small reviewable sprint with a gate.
2. **Structured answers = context-scoped** — summary→steps→CTA guidance ONLY in the no-lease system-prompt branch; scan/draft/citation rules untouched.
3. **Long answers = "Read in full view" → existing `expanded-reading` mode**, unlocked pre-upload (no per-bubble inline collapse).
4. **~~Upload CTA = focus + soft glow pulse~~ → REVISED (2026-06-03): NO upload control in the chat.**
   The lease is never dropped into / uploaded from the chat; the hero dropzone is the sole upload
   surface (parser-first). The assistant guides toward it with **text only** (decision #2's CTA line),
   never a button. Sprint **37.2 (in-chat Upload CTA + `uploadDropzoneRef`/spotlight) is dropped.**

## Sub-sprints
- **37.1 — No-lease polish + state-aware placeholder** *(done)*: drop the duplicate empty-state
  title; lighten the "Using:" row; warm `--shadow-popover`; elegant chip scale; state-aware composer
  placeholder; right-size the compact panel.
- **~~37.2 — In-assistant "Upload a lease" CTA + dropzone spotlight~~ — DROPPED** (no upload control in
  the chat; see revised decision #4).
- **37.3 — `landing-chat` growth + "Read in full view" expanded reading**: derive a `landing-chat` mode;
  unlock expand pre-upload; per-long-answer "Read in full view" → `expanded-reading`.
- **37.4 — Structured answers (context-scoped system prompt)**: no-lease-only answer-style section,
  ending with a **text** "upload your lease in the dropzone above" CTA (not a control).
- **37.5 — Motion + accessibility polish pass**: chip stagger, reduced-motion, a11y sweep.

## Out of scope / invariants
- `fullscreen-mobile` stays a responsive suffix (`MOBILE_SAFE_SIZE`), not a discrete mode.
- `AssistantFabContext` negative-guard holds (no `expanded`/`displayMode`/parser fields) — display state
  stays local to `AssistantFab.client`; the dropzone ref lives on `LeaseParserContext`.
- Keep the CSS resize transition (Sprint 36.4); no migration to Motion `layout`.
- No new dependencies. No commits until the user says so.

## Verification
Per sub-sprint: gate sweep (lint/typecheck/test/build — build only when no dev server is live) + live
Playwright (reach no-lease via Replace → "Reset workspace") + screenshots here + impl.md QA note.
