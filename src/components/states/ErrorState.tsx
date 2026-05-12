// Sprint 16B — shared error-state primitive.
//
// Slot-based: icon · title · description · actions. Same shape as EmptyState
// but with danger-tinted defaults and `role="alert"` (so screen readers
// announce the error immediately rather than waiting for focus).
//
// Used by:
//   - LeaseUploadDropzone error state (PDF rejected, server 4xx/5xx)
//   - Future: chat-route 5xx errors surface in the transcript
//   - Future: paste-text ingestion errors (Sprint 19)
//
// The visual treatment leans on semantic danger tokens (danger-100/600) so
// it reads consistently across light + dark schemes. Actions area is the
// typical recovery-action surface ("Try another file", "Paste text instead").

import type { ReactNode } from 'react';

export interface ErrorStateProps {
  /** Visual + decorative; rendered above the title. Typically an AlertTriangle. */
  icon?: ReactNode;
  /** Required. Short, action-oriented headline ("Upload failed"). */
  title: ReactNode;
  /** Optional body paragraph below the title. Use for the actual error message. */
  description?: ReactNode;
  /** Optional action area below the description (retry button, fallback link). */
  actions?: ReactNode;
  /**
   * ARIA role. Defaults to 'alert' — announced immediately by screen
   * readers when this surface renders. Use 'status' for non-blocking
   * errors that don't require immediate user attention.
   */
  role?: 'alert' | 'status';
  /**
   * 'centered' (default) — vertically centred with the danger-tinted
   * background surface. Use when the error is the primary content.
   * 'inline' — no background tint, smaller padding; use for inline
   * errors within a larger form/card.
   */
  variant?: 'centered' | 'inline';
  /** Optional override on the outermost wrapper. */
  className?: string;
  /** Test hook on the outermost element. */
  testId?: string;
}

const VARIANT_CLASS: Record<NonNullable<ErrorStateProps['variant']>, string> = {
  centered:
    'flex flex-col items-center gap-3 rounded-lg border border-danger-100 bg-danger-100/40 p-6 text-center dark:border-danger-600/40 dark:bg-danger-600/5',
  inline: 'flex items-start gap-3 rounded-md px-3 py-2 text-left',
};

export function ErrorState({
  icon,
  title,
  description,
  actions,
  role = 'alert',
  variant = 'centered',
  className,
  testId,
}: ErrorStateProps) {
  return (
    <div
      role={role}
      data-testid={testId}
      data-variant={variant}
      className={`${VARIANT_CLASS[variant]}${className ? ` ${className}` : ''}`}
    >
      {icon ? (
        <div className="text-danger-600 dark:text-danger-100">{icon}</div>
      ) : null}
      <div
        className={variant === 'centered' ? 'space-y-1' : 'flex-1 space-y-1'}
      >
        <div className="text-[15px] font-semibold tracking-tight text-fg-default">
          {title}
        </div>
        {description ? (
          <div className="text-xs leading-relaxed text-fg-muted">
            {description}
          </div>
        ) : null}
      </div>
      {actions ? <div className="mt-1">{actions}</div> : null}
    </div>
  );
}
