// Sprint 41/42 — single source for the site footer copy + nav, so it cannot
// drift between the landing page and the content pages that reuse it.
// Sprint 42 restructured the single Resources list into themed columns
// (Product / Resources / Legal); external tenant-help links live in
// `tenant-help.ts`.

export const LEASELENS_FOOTER = {
  tagline:
    'New Jersey residential lease review, grounded in tenant law — built to help tenants read their lease in plain English and spot what is worth negotiating before they sign.',
  copyrightName: 'LeaseLens',
  columns: [
    {
      id: 'product',
      label: 'Product',
      links: [
        { id: 'upload', label: 'Upload a lease', href: '/' },
        { id: 'how', label: 'How it works', href: '/#how-it-works' },
      ],
    },
    {
      id: 'resources',
      label: 'Resources',
      links: [
        { id: 'faq', label: 'FAQ', href: '/faq' },
        { id: 'terminology', label: 'Terminology', href: '/terminology' },
        { id: 'sources', label: 'NJ law sources', href: '/sources' },
      ],
    },
    {
      id: 'legal',
      label: 'Legal',
      links: [
        { id: 'privacy', label: 'Privacy & data', href: '/privacy' },
        { id: 'terms', label: 'Terms of use', href: '/terms' },
        { id: 'accessibility', label: 'Accessibility', href: '/accessibility' },
      ],
    },
  ],
} as const;
