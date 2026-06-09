// Sprint 42 — /terminology. Plain sync server component (no server data).

import type { Metadata } from 'next';
import { ContentPageShell } from '@/components/layout/ContentPageShell';
import { LEASELENS_TERMINOLOGY } from '@/lib/content/terminology';

export const metadata: Metadata = {
  title: 'Terminology — LeaseLens',
  description:
    'Plain-English definitions of the terms you meet in a LeaseLens review: clause, red flag, severity, NJSA, citation, grace period.',
};

export default function TerminologyPage(): React.JSX.Element {
  return (
    <ContentPageShell
      eyebrow="Glossary"
      title="Terminology"
      intro="The core terms you will meet in a LeaseLens review, in plain English."
    >
      <dl className="flex flex-col divide-y divide-border-hairline/70">
        {LEASELENS_TERMINOLOGY.map((entry) => (
          <div key={entry.id} className="flex flex-col gap-2 py-6 first:pt-0">
            <dt className="font-serif text-lg font-bold text-fg-default tracking-tight">
              {entry.term}
            </dt>
            <dd className="text-sm text-fg-muted leading-relaxed sm:text-base">
              {entry.definition}
            </dd>
          </div>
        ))}
      </dl>
    </ContentPageShell>
  );
}
