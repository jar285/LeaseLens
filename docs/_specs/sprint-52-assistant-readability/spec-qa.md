# Spec-QA — Sprint 52 Assistant chat drawer readability

Adversarial review of `spec.md` against the current code and the project invariants. Each finding is either
folded back into the spec or recorded here as a guardrail for implementation.

## Verified against code

- **Three chrome strips confirmed.** Brand `<header>` (`AssistantFab.client.tsx:537`), context bar
  (`assistant-context-bar`, `:609`), and ChatUI `conversation-toolbar` (`ChatUI.tsx:605`, `hidden` until
  `showToolbar`). The slim/overflow split (S52.1 + S52.2) targets the right two owners.
- **Clear-chat wiring confirmed.** `new-conversation-btn` → `handleNewConversation` (`ChatUI.tsx:651`),
  `aria-describedby={CLEAR_CHAT_HELPER_ID}` (`:652`), announcer at `:593`, undo toast/stash at `:691`. S52.2
  must keep all of these; it only relocates the trigger into a menu.
- **Reading measure confirmed.** Transcript column is `mx-auto w-full max-w-3xl` (`ChatTranscript.tsx:254`),
  body text `text-[14.5px] leading-[1.7]` (`ChatMessage.tsx:178`). Capping the column is the correct lever;
  type size is already good.
- **Snap state can reuse `expanded`.** It is local state (`AssistantFab.client.tsx:229`), resets on close
  (`:380`), and never lives in a context — satisfies invariant 6 with no new field.
- **Mobile override is purely class-based.** `MOBILE_SAFE_SIZE` (`:174`) is `max-sm:` utilities appended to the
  drawer className. Swapping it for `MOBILE_SHEET_SIZE` is a string change; the desktop anchor/sizes are on the
  same element and stay untouched. Tests can assert on the className string (the `max-sm:` classes are always
  present in the string regardless of viewport).

## Findings folded into the spec

1. **F1 — `origin-bottom-right` fights a bottom sheet.** `DRAWER_MOTION` hardcodes `origin-bottom-right`
   (`:193`); a full-width sheet should scale/rise from `origin-bottom`. Spec S52.3 adds `max-sm:origin-bottom`
   to the override so the mobile transform origin is centered-bottom while desktop keeps the corner origin.
2. **F2 — closed-state transform must change on mobile.** The closed drawer uses `translate-y-3 scale-95`
   (`:529`); a sheet should slide fully off-screen. Spec S52.3 overrides the mobile closed state to
   `max-sm:translate-y-full` (slide-up) so the sheet enters from below, not a 12px nudge.
3. **F3 — snap handle must not depend on `canExpand`.** The desktop expand button is gated on `canExpand`
   (`:564`); on mobile a pre-upload help sheet must still expand to read a long answer. Spec S52.3 makes the
   mobile snap handle unconditional and leaves the desktop expand button's gate intact (so the compact-help
   panel can never strand large on desktop — the original reason for the gate).
4. **F4 — overflow menu is the heaviest slice; keep it minimal but correct.** A `role="menu"` popover needs
   Escape, outside-pointerdown close, focus-in-on-open, focus-return-on-close, and `aria-haspopup`/
   `aria-expanded`. Spec S52.2 enumerates these so the slice does not ship a half-accessible menu. If the menu
   proves disproportionate in review, the documented fallback is a single compact icon-button toolbar (no
   popover) — but the user explicitly chose "slim + overflow," so the menu is the target.
5. **F5 — reading-measure change is global.** Tightening `max-w-3xl` affects the non-FAB hero chat mount too.
   This is acceptable and arguably better (measure should be capped everywhere), but it is called out in S52.4
   and impl.md so it is a deliberate, not accidental, change. A `ChatTranscript.test.tsx` pin documents it.

## Guardrails (do during implementation)

- **Mount survival.** After S52.3, add/keep a test that types a draft, toggles the snap handle, and asserts the
  draft persists (proves no remount). The `ChatUI` instance must stay in the same DOM position across all snap
  states — do not wrap it in a snap-conditional branch.
- **happy-dom + reduced motion.** Component tests assert on the className tokens (`motion-reduce:transition-none`,
  `max-sm:*`), not on computed layout — happy-dom does not evaluate media queries or run the resize transition.
  The real half/full visual is verified in Playwright at 390px.
- **No `inert=""`.** The drawer's `inert={drawerOpen ? undefined : true}` pattern (`:504`) is untouched; do not
  reintroduce the empty-string form anywhere in the new menu/handle markup.
- **Touch targets.** Snap handle and menu items each clear 44px (WCAG 2.5.5) — mirror the existing
  `h-11 w-11` close/expand buttons.
- **Status pairing.** S52.1 must keep the status dot beside a status word (never colour-only) — the existing
  `assistant-using-status-dot` + trailing status text pattern.
- **Pinned e2e.** Before merge, grep `tests/e2e/` for `new-conversation-btn`, `continue-previous-btn`,
  `assistant-fab-drawer`, `assistant-fab-expand`; update any spec that now needs an open-menu step (S52.2) or
  that asserts the old `MOBILE_SAFE_SIZE` classes (S52.3).

## Copy check (impeccable shared laws)

- No em dashes in any new visible string (menu labels, handle aria, status line). Use commas/colons/periods.
- No new gradient text, no glassmorphism beyond the already-shipped warm-glass surface, no side-stripe borders.
- Menu labels stay verbs the user can scan ("Clear assistant chat", "Continue previous"); aria-labels on the
  handle are state-named ("Expand chat" / "Collapse chat").

## Open question for the user (non-blocking)

- **"NJ tenant-law guidance" subline (S52.1).** The slim direction says "one brand line." Options: (a) keep the
  subline but tighten padding, (b) drop it and let the status line carry orientation. Recommendation: **(a)** —
  it is the only place the assistant states its scope/limits, which matters for a legal-adjacent tool. Will
  proceed with (a) unless told otherwise; this does not block writing tests.

## Verdict

Spec is implementable and internally consistent. Slices are single-purpose and ordered mobile-first
(header/menu reclaim → sheet → web measure). No invariant conflicts; the two structural risks (sheet transform
origin/closed-state, overflow-menu a11y) are folded in. Ready for approval.
