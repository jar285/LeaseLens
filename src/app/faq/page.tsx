// Sprint 41 — /faq. Plain sync server component (no server data) → Next
// statically prerenders it, and its colocated test renders it directly.

import type { Metadata } from 'next';
import { ContentPageShell } from '@/components/layout/ContentPageShell';
import { LEASELENS_FAQ } from '@/lib/content/faq';

export const metadata: Metadata = {
  title: 'FAQ — LeaseLens',
  description:
    'Common questions about how LeaseLens reviews NJ residential leases, what a red flag is, and how your lease data is handled.',
};

export default function FaqPage(): React.JSX.Element {
  return (
    <ContentPageShell
      eyebrow="Frequently asked"
      title="FAQ"
      intro="What LeaseLens does, what it doesn't, and how your lease is handled."
    >
      <dl className="flex flex-col divide-y divide-border-hairline/70">
        {LEASELENS_FAQ.map((item) => (
          <div key={item.id} className="flex flex-col gap-2 py-6 first:pt-0">
            <dt className="font-serif text-lg font-bold text-fg-default tracking-tight">
              {item.question}
            </dt>
            <dd className="text-sm text-fg-muted leading-relaxed sm:text-base">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>
    </ContentPageShell>
  );
}
