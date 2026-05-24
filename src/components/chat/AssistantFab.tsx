// Sprint 26c — dynamic wrapper for the assistant FAB.
//
// Defers loading the real implementation (which pulls in the full chat
// surface: ChatUI + ChatTranscript + ToolCard + markdown renderer +
// mermaid) until the user interacts. Keeps the parser-first landing
// page's initial bundle minimal. Mirrors the PdfViewer dynamic-wrapper
// pattern used elsewhere in the app.

'use client';

import dynamic from 'next/dynamic';

export type { AssistantFabClientProps as AssistantFabProps } from './AssistantFab.client';

export const AssistantFab = dynamic(
  () => import('./AssistantFab.client').then((m) => m.AssistantFabClient),
  {
    ssr: false,
    // Render the pill instantly so layout doesn't shift on first paint;
    // the heavy bundle keeps loading in the background and replaces this
    // placeholder once ready. The button is non-interactive while
    // loading; opens once the real implementation hydrates.
    // Sprint 26c.10 — loading placeholder mirrors the bumped real pill
    // (h-16/w-16, inner spinner h-5/w-5) so first paint doesn't shift
    // layout when the real component hydrates.
    loading: () => (
      <button
        type="button"
        data-testid="assistant-fab"
        data-state="loading"
        aria-label="Open assistant"
        disabled
        className="fixed right-6 bottom-6 z-overlay inline-flex h-16 w-16 items-center justify-center rounded-full bg-accent-600 text-white shadow-lg dark:bg-accent-500"
      >
        <span
          aria-hidden="true"
          className="inline-block h-5 w-5 animate-pulse rounded-full bg-white/40"
        />
      </button>
    ),
  },
);
