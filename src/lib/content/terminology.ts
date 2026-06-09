// Sprint 42 — plain-English glossary for /terminology. The core concepts a
// tenant meets in a LeaseLens review, grounded in the grading model
// (src/components/lease/grading.ts) and the NJ corpus.

export const LEASELENS_TERMINOLOGY = [
  {
    id: 'clause',
    term: 'Clause',
    definition:
      'A numbered provision of the lease. LeaseLens extracts each clause and classifies it by type (security deposit, late fee, entry, subletting, and so on) before grading it.',
  },
  {
    id: 'red-flag',
    term: 'Red flag',
    definition:
      'A clause that conflicts with — or leans against — a NJ tenant-law protection. Red flags are what LeaseLens surfaces for you to question or negotiate before signing.',
  },
  {
    id: 'severity',
    term: 'Severity',
    definition:
      'How much a clause could hurt the tenant if enforced, shown as High, Medium, Low, or OK — communicated with text and an icon, never color alone.',
  },
  {
    id: 'njsa',
    term: 'NJSA',
    definition:
      'New Jersey Statutes Annotated — the citation format for NJ state law (for example, N.J.S.A. 46:8-21.1, the security-deposit return statute). Every red-flag grading points to the source behind it.',
  },
  {
    id: 'citation',
    term: 'Citation',
    definition:
      'The specific statute or case a grading relies on, drawn from the NJ tenant-law corpus. If a supporting source is missing, LeaseLens says so rather than inventing one.',
  },
  {
    id: 'grace-period',
    term: 'Grace period',
    definition:
      'The window after the rent due date before a late fee may apply. NJ law gives certain tenants a statutory grace period; LeaseLens checks late-fee clauses against it.',
  },
] as const;
