'use client';

// Sprint 44A.3 — route-segment error boundary. Renders the shared, accessible
// ErrorState (role=alert), surfaces the digest as a correlation handle the user
// can quote, offers retry (reset) + a way home, and reports digest+name to the
// server logger (Michael Nygard: the page degrades gracefully instead of
// white-screening).

import Link from 'next/link';
import { useEffect } from 'react';
import { ErrorState } from '@/components/states/ErrorState';
import { reportClientError } from '@/lib/log/report-client-error';

const ACTION_BUTTON =
  'inline-flex min-h-11 items-center justify-center rounded-md bg-accent-600 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2';
const ACTION_LINK =
  'inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-fg-default transition-colors hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2';

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Fire-and-forget; reporting must never cascade into another error.
    reportClientError({ digest: error.digest, name: error.name }).catch(
      () => {},
    );
  }, [error.digest, error.name]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-base px-6 py-16 font-sans text-fg-default">
      <div className="w-full max-w-md">
        <ErrorState
          testId="route-error"
          title="Something went wrong"
          description={
            <>
              An unexpected error interrupted this page. You can try again, or
              head back to the homepage.
              {error.digest ? (
                <span className="mt-2 block font-mono text-[11px] text-fg-muted">
                  Reference: {error.digest}
                </span>
              ) : null}
            </>
          }
          actions={
            <div className="flex items-center justify-center gap-3">
              <button type="button" onClick={reset} className={ACTION_BUTTON}>
                Try again
              </button>
              <Link href="/" className={ACTION_LINK}>
                Back to home
              </Link>
            </div>
          }
        />
      </div>
    </main>
  );
}
