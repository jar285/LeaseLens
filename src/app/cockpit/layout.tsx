import type { ReactNode } from 'react';

export default function CockpitLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f8f9fa] font-sans text-gray-900">
      {children}
    </main>
  );
}
