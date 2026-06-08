// Sprint 43.1 — single root contract for motion. One <MotionConfig
// reducedMotion="user"> so Motion auto-disables transform/layout animations for
// users who request reduced motion — a backstop to the per-component
// useReducedMotion() branches already across the codebase, satisfying the
// CLAUDE.md "reduced-motion respected at every site" invariant by construction.
//
// Deliberately thin: a wrapper, not a behavior change for existing
// useReducedMotion() sites (the hook already reads the media query). Deferred
// (own sprint): wrap a <LazyMotion features={domAnimation}> here once the
// {motion} -> m bundle migration lands — call sites won't change.

'use client';

import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

export function MotionProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
