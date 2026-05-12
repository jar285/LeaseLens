// Sprint 16B — shared empty-state primitive.
//
// Slot-based: icon · title · description · actions. Used by:
//   - ChatEmptyState (welcome screen, with Source Serif 4 H1 + 4 motion cards
//     passed as children of the title + actions slots)
//   - RedFlagReport empty state (paperclip + microcopy)
//   - Future: dropzone idle state, paste-text fallback, generic "nothing here"
//
// Defaults assume a centered, neutral surface — the chat welcome state's
// staggered cards stay inside the consumer because the motion logic is
// specific to that surface; the primitive provides the layout + a11y wrapper.

import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Visual + decorative; rendered above the title. Pass `aria-hidden` on the icon itself. */
  icon?: ReactNode;
  /** Required. Heading-level element OR plain string (rendered inside a div if string). */
  title: ReactNode;
  /** Optional body paragraph below the title. */
  description?: ReactNode;
  /** Optional action area below the description (buttons, cards, links). */
  actions?: ReactNode;
  /**
   * 'center' (default) — vertically centred in the available height with the
   * outer container as `min-h-[60vh] flex items-center justify-center`.
   * 'top' — stacks from the top with a fixed `py-12` rhythm; use when the
   * parent already constrains the vertical region.
   */
  align?: 'center' | 'top';
  /** Optional override on the outermost wrapper (extra Tailwind utilities). */
  className?: string;
  /** Test hook on the outermost element. */
  testId?: string;
}

const ALIGN_CLASS: Record<NonNullable<EmptyStateProps['align']>, string> = {
  center:
    'flex min-h-[60vh] w-full flex-1 flex-col items-center justify-center px-6 py-12 text-center',
  top: 'flex flex-col items-center px-2 py-12 text-center',
};

export function EmptyState({
  icon,
  title,
  description,
  actions,
  align = 'center',
  className,
  testId,
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={`${ALIGN_CLASS[align]}${className ? ` ${className}` : ''}`}
    >
      {icon ? <div className="mb-8">{icon}</div> : null}
      <div className="mb-2">
        {typeof title === 'string' ? (
          <div className="text-fg-default">{title}</div>
        ) : (
          title
        )}
      </div>
      {description ? (
        <div className="mb-10 max-w-md text-[15px] leading-relaxed text-fg-muted">
          {description}
        </div>
      ) : null}
      {actions}
    </div>
  );
}
