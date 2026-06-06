// Sprint 41 — /privacy. The lead reuses LEASELENS_DATA_PANEL (the landing
// privacy panel) so the two surfaces cannot drift; sections expand on it.
// Plain sync server component (no server data).

import type { Metadata } from 'next';
import { ContentPageShell } from '@/components/layout/ContentPageShell';
import { LEASELENS_PRIVACY } from '@/lib/content/privacy';

export const metadata: Metadata = {
  title: 'Privacy & data — LeaseLens',
  description:
    'How LeaseLens handles your lease: analyzed in-session, never embedded into the public NJ tenant-law index, and cleared on Replace.',
};

export default function PrivacyPage(): React.JSX.Element {
  const { lead, sections } = LEASELENS_PRIVACY;
  return (
    <ContentPageShell
      eyebrow={lead.eyebrow}
      title="Privacy & data"
      intro={lead.body}
    >
      <p className="font-serif text-xl font-bold text-fg-default tracking-tight sm:text-2xl">
        {lead.headline}
      </p>
      <div className="mt-8 flex flex-col gap-8">
        {sections.map((section) => (
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
