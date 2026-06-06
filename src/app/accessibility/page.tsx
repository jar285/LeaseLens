// Sprint 42 — /accessibility. Plain sync server component (no server data).

import type { Metadata } from 'next';
import { ContentPageShell } from '@/components/layout/ContentPageShell';
import { LEASELENS_ACCESSIBILITY } from '@/lib/content/accessibility';

export const metadata: Metadata = {
  title: 'Accessibility — LeaseLens',
  description:
    'LeaseLens targets WCAG 2.1 AA: contrast, keyboard operability, focus, semantic structure, reduced-motion, and severity never by color alone.',
};

export default function AccessibilityPage(): React.JSX.Element {
  return (
    <ContentPageShell
      eyebrow="Commitment"
      title="Accessibility"
      intro={LEASELENS_ACCESSIBILITY.intro}
    >
      <div className="flex flex-col gap-8">
        {LEASELENS_ACCESSIBILITY.sections.map((section) => (
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
