// Sprint 16B — shared container primitive.
//
// Standardises max-width + horizontal padding for centred content blocks.
// Used by /cockpit's content region today (`max-w-6xl mx-auto px-6 py-8`).
// Future Sprint 17 usage: any landing-style hero section that needs the
// same readable width on the homepage workspace.
//
// Sizes follow Tailwind's max-w-* scale. Default is 'xl' (max-w-6xl)
// to match the cockpit's current width — keeps the visual rhythm
// unchanged when consumers refactor to use this primitive.

import type { ReactNode } from 'react';

type ContainerSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface ContainerProps {
  children: ReactNode;
  /** Tailwind max-w-* scale. Default 'xl' = max-w-6xl. */
  size?: ContainerSize;
  /** Optional className override (appended). */
  className?: string;
  /** Render `as` an alternate HTML element. Default 'div'. */
  as?: 'div' | 'section' | 'article' | 'header' | 'footer';
  /** Test hook on the outermost element. */
  testId?: string;
}

const SIZE_CLASS: Record<ContainerSize, string> = {
  sm: 'max-w-3xl',
  md: 'max-w-4xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
  '2xl': 'max-w-7xl',
};

export function Container({
  children,
  size = 'xl',
  className,
  as: As = 'div',
  testId,
}: ContainerProps) {
  return (
    <As
      data-testid={testId}
      data-size={size}
      className={`mx-auto px-6 ${SIZE_CLASS[size]}${className ? ` ${className}` : ''}`}
    >
      {children}
    </As>
  );
}
