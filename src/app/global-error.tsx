'use client';

// Sprint 44A.3 — root error boundary. Replaces the root layout when IT throws,
// so it must render its own <html>/<body>. Same accessible fallback + server
// report as error.tsx. Note: because it supplants the root layout, the global
// stylesheet may not be guaranteed — the fallback stays semantically correct
// (role=alert, real text, a working retry) even if Tailwind classes don't load.

import { useEffect } from 'react';
import { ErrorState } from '@/components/states/ErrorState';
import { reportClientError } from '@/lib/log/report-client-error';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError({ digest: error.digest, name: error.name }).catch(
      () => {},
    );
  }, [error.digest, error.name]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-surface-base px-6 py-16 font-sans text-fg-default antialiased">
        <div className="w-full max-w-md">
          <ErrorState
            testId="global-error"
            title="Something went wrong"
            description={
              <>
                The application hit an unexpected error. Please try again.
                {error.digest ? (
                  <span className="mt-2 block font-mono text-[11px] text-fg-muted">
                    Reference: {error.digest}
                  </span>
                ) : null}
              </>
            }
            actions={
              <button
                type="button"
                onClick={reset}
                className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent-600 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2"
              >
                Try again
              </button>
            }
          />
        </div>
      </body>
    </html>
  );
}
