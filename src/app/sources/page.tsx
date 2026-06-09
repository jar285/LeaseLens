// Sprint 41 — /sources. The NJ tenant-law statutes + case law behind
// LeaseLens citations (grounded in src/corpus/nj-tenant-law). Plain sync
// server component (no server data).

import type { Metadata } from 'next';
import { ContentPageShell } from '@/components/layout/ContentPageShell';
import { LEASELENS_NJ_SOURCES } from '@/lib/content/nj-sources';

export const metadata: Metadata = {
  title: 'NJ tenant-law sources — LeaseLens',
  description:
    'The New Jersey tenant-law statutes and case law behind LeaseLens clause-grading citations.',
};

export default function SourcesPage(): React.JSX.Element {
  return (
    <ContentPageShell
      eyebrow="Further reading"
      title="NJ tenant-law sources"
      intro="LeaseLens grounds every clause grading in NJ tenant law. These are the primary sources behind those citations — read the statute itself for the controlling text. This is not legal advice."
    >
      <ul className="flex flex-col divide-y divide-border-hairline/70">
        {LEASELENS_NJ_SOURCES.map((source) => (
          <li key={source.id} className="flex flex-col gap-1.5 py-6 first:pt-0">
            <p className="font-mono text-[11px] text-accent-700 tracking-[0.12em] uppercase dark:text-accent-300">
              {source.citation}
            </p>
            <h2 className="font-serif text-lg font-bold text-fg-default tracking-tight">
              {source.title}
            </h2>
            <p className="text-sm text-fg-muted leading-relaxed">
              {source.note}
            </p>
          </li>
        ))}
      </ul>
    </ContentPageShell>
  );
}
