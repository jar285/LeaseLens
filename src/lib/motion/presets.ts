import type { Transition } from 'motion/react';

/*
 * Sprint 23g — canonical motion presets.
 *
 * Two spring profiles + one snap-back profile cover the entire interaction
 * surface. Component-level `transition={}` calls should reach for one of
 * these instead of inlining magic numbers; that keeps the "some smooth,
 * some not" inconsistency out of the system.
 *
 * Pair these with `useReducedMotion()` and the static-fallback branch
 * already in place across the codebase — reduced-motion users skip the
 * motion path entirely; these presets are not a substitute for that gate.
 */

/**
 * `gentle` — cards entering / exiting the rail, pane content swaps,
 * AnimatePresence layout transitions. Reads as "calm, considered."
 * Settles in ~360–420ms.
 */
export const SPRING_GENTLE = {
  type: 'spring',
  stiffness: 260,
  damping: 30,
  mass: 0.9,
} satisfies Transition;

/**
 * `snappy` — pills, badges, buttons, send button tap-feedback,
 * role-switcher pill background. Reads as "responsive, alive."
 * Settles in ~180–220ms.
 */
export const SPRING_SNAPPY = {
  type: 'spring',
  stiffness: 500,
  damping: 38,
} satisfies Transition;

/**
 * `snap-back` — for drag gestures that should always spring to origin
 * after release (PDF page-swipe, dismissible cards). Stiffer than
 * `gentle` and slightly less damped so the return feels like physical
 * paper, not chrome.
 */
export const SPRING_SNAP_BACK = {
  type: 'spring',
  stiffness: 400,
  damping: 32,
  mass: 0.7,
} satisfies Transition;

/**
 * Cubic mirror of the `--ease-out-soft` CSS token. Use this for non-spring
 * motion (fades, opacity, staggered list reveals) so motion-driven and
 * Tailwind/CSS-driven transitions share the same arc.
 */
export const EASE_OUT_SOFT = [0.22, 1, 0.36, 1] as const;

/**
 * Cubic mirror of the `--ease-in-out-soft` CSS token. For symmetric
 * transitions (a value that grows and then settles back).
 */
export const EASE_IN_OUT_SOFT = [0.45, 0, 0.55, 1] as const;

/*
 * Sprint 43.1 — motion tokens. The springs above cover physical/interactive
 * motion; these cover *tween* motion (fades, flips, staggered reveals) so
 * durations and easings stop being inlined magic numbers. Values are in
 * SECONDS (Motion's `duration` unit), not ms.
 */

/**
 * Duration scale, ascending. `enter` doubles as the ceiling for the Mode A->B
 * workspace flip (Sprint 43.3) — orientation, not a wait.
 */
export const DURATION = {
  fast: 0.15,
  base: 0.25,
  enter: 0.4,
} as const;

/**
 * Easing tokens — aliases onto the existing cubic arcs so motion-driven and
 * CSS-driven transitions share one curve. `standard` for entrances/most moves,
 * `exit` for symmetric grow-and-settle.
 */
export const EASE = {
  standard: EASE_OUT_SOFT,
  exit: EASE_IN_OUT_SOFT,
} as const;

/**
 * Per-sibling delay for list-entrance stagger (Sprint 43.4). Kept small and
 * bounded so a long list never withholds high-severity content behind a reveal.
 */
export const STAGGER = 0.05;
