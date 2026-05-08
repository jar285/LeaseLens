import type { ReactNode } from 'react';

// Sprint 15.2 — token-driven backdrop. The original hard-coded
// `bg-[#f8f9fa] text-gray-900` overrode the body's `bg-surface-base` /
// `color: var(--color-fg-default)` and never dark-flipped, so the
// cockpit page-area stayed light even when .dark was on <html>. Tokens
// here pick up both light and dark values automatically.
export default function CockpitLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-surface-base font-sans text-fg-default">
      {children}
    </main>
  );
}
