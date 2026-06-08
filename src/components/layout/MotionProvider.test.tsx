// Sprint 43.1 — MotionProvider is a deliberately-thin root wrapper: one
// <MotionConfig reducedMotion="user"> so reduced-motion is honored by
// construction, a backstop to the per-component useReducedMotion() branches
// already across the codebase. The substantive enforcement (transform
// auto-disable) is not observable under happy-dom (no layout/animation), so the
// real reduced-motion gate is the Playwright run (43.7). Note the existing
// per-component reduced-motion tests mount WITHOUT this provider, so a green
// suite proves this change didn't regress them — not that MotionConfig coexists
// correctly with their useReducedMotion() branches (that interaction is the
// Playwright gate's job). Here we pin only the structural contract: it renders
// children transparently, including under a reduced-motion preference and around
// a motion child.

import { render, screen } from '@testing-library/react';
import { motion } from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from './MotionProvider';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockReducedMotion(matches: boolean): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion') ? matches : false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
        onchange: null,
      }) as MediaQueryList,
  );
}

describe('MotionProvider (Sprint 43.1)', () => {
  it('renders its children', () => {
    render(
      <MotionProvider>
        <div data-testid="child">content</div>
      </MotionProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders a motion child transparently when reduced-motion is preferred', () => {
    mockReducedMotion(true);
    render(
      <MotionProvider>
        <motion.div
          data-testid="animated"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          ok
        </motion.div>
      </MotionProvider>,
    );
    expect(screen.getByTestId('animated')).toBeInTheDocument();
  });
});
