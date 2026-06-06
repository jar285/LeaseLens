// Sprint 42 — /terms. Plain sync server component (no server data).

import type { Metadata } from 'next';
import { ContentPageShell } from '@/components/layout/ContentPageShell';
import { LEASELENS_TERMS } from '@/lib/content/terms';

export const metadata: Metadata = {
  title: 'Terms of use — LeaseLens',
  description:
    'What LeaseLens is, how you may use it, and its limits — an informational NJ-lease review tool, not legal advice.',
};

export default function TermsPage(): React.JSX.Element {
  return (
    <ContentPageShell
      eyebrow="Legal"
      title="Terms of use"
      intro={LEASELENS_TERMS.intro}
    >
      <div className="flex flex-col gap-8">
        {LEASELENS_TERMS.sections.map((section) => (
          <section key={section.id} className="flex flex-col gap-2">
            <h2 className="font-serif text-lg font-bold text-fg-default tracking-tight">
              {section.heading}
            </h2>
            <p className="text-sm text-fg-muted leading-relaxed sm:text-base">
              {section.body}
            </p>
          </section>
        ))}
      </div>
    </ContentPageShell>
  );
}
