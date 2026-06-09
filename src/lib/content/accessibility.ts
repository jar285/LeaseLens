// Sprint 42 — Accessibility statement for /accessibility. Backed by the
// project's real WCAG-AA baseline (an invariant in CLAUDE.md + the design
// philosophy), so every claim here is one we actually implement.

export const LEASELENS_ACCESSIBILITY = {
  intro:
    'Accessibility is a baseline requirement for LeaseLens, not an afterthought. We aim to meet WCAG 2.1 AA across the parser workflow and the assistant.',
  sections: [
    {
      id: 'what-we-do',
      heading: 'What we do',
      body: 'We design for WCAG-AA contrast, keyboard operability, visible focus rings, semantic landmarks and headings, labelled controls, and ≥44px touch targets. Severity is always communicated by text and icon/shape — never by color alone.',
    },
    {
      id: 'motion',
      heading: 'Motion',
      body: 'Every animation respects prefers-reduced-motion: transitions and staggered reveals are disabled when you ask your system to reduce motion, leaving a calm, static experience.',
    },
    {
      id: 'known-limitations',
      heading: 'Known limitations',
      body: 'The PDF viewer renders third-party documents whose own structure we cannot fully control, and scanned (image-only) leases without a text layer are not yet supported. We treat barriers we find as bugs to fix.',
    },
    {
      id: 'scope',
      heading: 'Scope',
      body: 'This statement covers the LeaseLens web app. Linked external resources (for example, NJ legal-aid sites) have their own accessibility practices.',
    },
  ],
} as const;
