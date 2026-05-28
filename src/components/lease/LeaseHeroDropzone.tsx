// Sprint 26a — Parser-first landing.
//
// Hero-sized presentational wrapper around LeaseUploadDropzone. Owns the
// editorial headline + subhead; delegates upload logic to the inner
// dropzone unchanged. The four chat-prompt cards from ChatEmptyState are
// intentionally NOT carried over here — they become FAB quick-actions
// in Sprint 26c.

'use client';

import {
  LeaseUploadDropzone,
  type LeaseUploadDropzoneProps,
  type UploadResult,
} from './LeaseUploadDropzone';

export interface LeaseHeroDropzoneProps {
  onUploaded: (result: UploadResult, file: File) => void;
  onError?: LeaseUploadDropzoneProps['onError'];
  conversationId?: LeaseUploadDropzoneProps['conversationId'];
}

export function LeaseHeroDropzone({
  onUploaded,
  onError,
  conversationId,
}: LeaseHeroDropzoneProps): React.JSX.Element {
  return (
    <section
      data-testid="lease-hero-dropzone"
      className="flex w-full max-w-2xl flex-col items-center gap-4"
    >
      {/* Sprint 26c.4 — hero headline bumped one step (text-3xl → text-4xl
          on mobile; sm:text-4xl → sm:text-5xl on desktop) so the message
          carries more weight than the navbar brand mark. `leading-[1.1]`
          tightens the line height at the larger size so the two-line
          headline reads as one editorial display block rather than two
          separated lines. `max-w-2xl` widens the wrap window so the
          larger type doesn't break awkwardly. */}
      <h1
        data-testid="lease-hero-headline"
        className="max-w-2xl text-balance text-center font-serif font-bold text-4xl text-fg-default leading-[1.1] tracking-tight sm:text-[3.25rem]"
      >
        Find what to <em className="font-normal italic">negotiate</em>, before
        you sign.
      </h1>
      {/* Sprint 29.x — CloudConvert-style: headline carries the promise;
          the dropzone owns the "drop here" instruction (no duplicate copy). */}
      <p
        data-testid="lease-hero-subhead"
        className="max-w-md text-balance text-center text-sm text-fg-muted leading-relaxed"
      >
        Parse clauses, cite NJ tenant law, and surface red flags before you
        sign.
      </p>
      <div
        data-testid="lease-hero-dropzone-tray"
        className="relative w-full rounded-3xl p-0.5 shadow-sm ring-1 ring-border-hairline/50"
      >
        <LeaseUploadDropzone
          presentation="hero"
          onUploaded={onUploaded}
          onError={onError}
          conversationId={conversationId}
        />
      </div>
    </section>
  );
}
