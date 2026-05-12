// Sprint 16B — shared vertical-rhythm primitive.
//
// A thin wrapper around `flex flex-col gap-{N}` so consumers don't repeat
// the same Tailwind class triplet whenever they stack content. Used today
// in the dropzone column, RedFlagReport list, cockpit dashboard panels,
// and several other places that compose vertical sections.
//
// Sized by Tailwind's spacing scale. Default gap is '4' (1rem) which
// matches the most common rhythm in the codebase.

import type { ReactNode } from 'react';

type StackGap = '0' | '1' | '1.5' | '2' | '2.5' | '3' | '4' | '6' | '8';

export interface StackProps {
  children: ReactNode;
  /** Tailwind gap-* value. Default '4'. */
  gap?: StackGap;
  /** Optional className override. */
  className?: string;
  /** Render `as` an alternate HTML element. Default 'div'. */
  as?: 'div' | 'section' | 'article' | 'ul' | 'ol' | 'header' | 'footer';
  /** Test hook on the outermost element. */
  testId?: string;
}

const GAP_CLASS: Record<StackGap, string> = {
  '0': 'gap-0',
  '1': 'gap-1',
  '1.5': 'gap-1.5',
  '2': 'gap-2',
  '2.5': 'gap-2.5',
  '3': 'gap-3',
  '4': 'gap-4',
  '6': 'gap-6',
  '8': 'gap-8',
};

export function Stack({
  children,
  gap = '4',
  className,
  as: As = 'div',
  testId,
}: StackProps) {
  return (
    <As
      data-testid={testId}
      data-gap={gap}
      className={`flex flex-col ${GAP_CLASS[gap]}${className ? ` ${className}` : ''}`}
    >
      {children}
    </As>
  );
}
