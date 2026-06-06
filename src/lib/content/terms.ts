// Sprint 42 — Terms of Use content for /terms. Honest + scoped to what
// LeaseLens actually is: an informational NJ-lease review tool, not a law
// firm. Mirrors the single-source disclaimer's stance without overclaiming.

export const LEASELENS_TERMS = {
  intro:
    'These terms explain what LeaseLens is, how you may use it, and its limits. By using LeaseLens you agree to them.',
  sections: [
    {
      id: 'what-this-is',
      heading: 'What LeaseLens is',
      body: 'LeaseLens is an informational tool that reviews New Jersey residential leases, extracts clauses, and grades them against NJ tenant-law sources. It is a starting point for understanding a lease — not a substitute for professional advice.',
    },
    {
      id: 'not-legal-advice',
      heading: 'Not legal advice; no attorney–client relationship',
      body: 'LeaseLens is not a law firm and does not provide legal advice. Using it does not create an attorney–client relationship. Before acting on any clause grading or draft email, consult a tenant attorney or your local NJ legal-aid clinic.',
    },
    {
      id: 'permitted-use',
      heading: 'Permitted use',
      body: 'Use LeaseLens to review leases you have a legitimate reason to review. Do not upload documents you are not permitted to share, and do not rely on it as your sole basis for a legal or financial decision.',
    },
    {
      id: 'no-warranty',
      heading: 'No warranty on accuracy',
      body: 'Clause extraction and grading are automated and can be incomplete or wrong. Statutes and case law change. LeaseLens is provided "as is," without warranty, and you are responsible for verifying anything important with a qualified professional.',
    },
    {
      id: 'changes',
      heading: 'Changes',
      body: 'LeaseLens is under active development; features, content, and these terms may change. Continued use after a change means you accept the updated terms.',
    },
  ],
} as const;
