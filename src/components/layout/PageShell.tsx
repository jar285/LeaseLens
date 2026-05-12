// Sprint 16B — shared page-shell primitive.
//
// One outer container with the two layout variants the codebase uses:
//   - layout="fixed":  h-dvh flex-col overflow-hidden. The page itself
//                       never scrolls; child panes own their scroll. Used
//                       by /, where the three-pane workspace fills the
//                       viewport exactly.
//   - layout="page":   min-h-screen with normal page scroll. Used by
//                       /cockpit, where the dashboard panels stack and
//                       the page scrolls naturally.
//
// PageShell is a thin typed wrapper — no compound API. The consumer owns
// header + main composition because both pages compose those slots
// differently (chat has a header + a workspace shell; cockpit has a
// header + a centred max-width content block).
//
// The token-driven background and font-sans + fg-default text are baked
// in here so every page picks up the design system without repeating
// the same className string.

import type { ReactNode } from 'react';

export interface PageShellProps {
  /**
   * 'fixed' — `h-dvh flex flex-col overflow-hidden`. The page never
   * scrolls; children manage their own scroll regions.
   * 'page' — `min-h-screen`. Standard document flow with natural scroll.
   */
  layout?: 'fixed' | 'page';
  children: ReactNode;
  /** Optional className override (appended after the variant classes). */
  className?: string;
  /** Test hook on the outermost element. */
  testId?: string;
}

const LAYOUT_CLASS: Record<NonNullable<PageShellProps['layout']>, string> = {
  fixed:
    'flex h-dvh flex-col overflow-hidden bg-surface-base font-sans text-fg-default',
  page: 'min-h-screen bg-surface-base font-sans text-fg-default',
};

export function PageShell({
  layout = 'fixed',
  children,
  className,
  testId,
}: PageShellProps) {
  return (
    <main
      data-testid={testId}
      data-layout={layout}
      className={`${LAYOUT_CLASS[layout]}${className ? ` ${className}` : ''}`}
    >
      {children}
    </main>
  );
}
