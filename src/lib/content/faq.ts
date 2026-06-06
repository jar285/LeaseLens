// Sprint 41 — FAQ content for /faq. Plain-English, grounded in real product
// behavior (parser-first, NJ-only, in-session, source-grounded). Single
// source so the page copy cannot drift from its test.

export const LEASELENS_FAQ = [
  {
    id: 'what',
    question: 'What does LeaseLens do?',
    answer:
      'LeaseLens reads a New Jersey residential lease PDF, extracts each clause, grades it against NJ tenant-law sources, and surfaces red flags in plain English — so you know what to ask about before you sign.',
  },
  {
    id: 'advice',
    question: 'Is this legal advice?',
    answer:
      'No. LeaseLens is informational only and is not a lawyer. Its clause gradings and draft emails are a starting point for your own review. Before acting on anything, consult a tenant attorney or your local NJ legal-aid clinic.',
  },
  {
    id: 'scope',
    question: 'Which leases does it support?',
    answer:
      'New Jersey residential leases, as PDFs with selectable text. Scanned or image-only PDFs without a text layer are not supported yet, and LeaseLens does not cover commercial leases or other states.',
  },
  {
    id: 'red-flag',
    question: 'What is a red flag?',
    answer:
      'A red flag is a clause that conflicts with — or leans against — NJ tenant-law protections. Each flag is graded High, Medium, or Low severity, shown with text and an icon (never color alone), and tied to the clause it came from.',
  },
  {
    id: 'citations',
    question: 'Does every flag cite a statute?',
    answer:
      'Yes. Gradings are grounded in NJ tenant-law sources and cite the relevant statute (for example, N.J.S.A. 46:8-21.1 for security-deposit return). If a supporting source is missing, LeaseLens says so rather than inventing one.',
  },
  {
    id: 'data',
    question: 'What happens to my lease?',
    answer:
      'Your lease is analyzed for clauses and red flags in your current session. Lease PDFs are never embedded into the public NJ tenant-law index. See Privacy & data for the details.',
  },
] as const;
