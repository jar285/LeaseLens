// Sprint 29.x — Mode A below-fold panels (CloudConvert-style scroll band).
// Single source so landing copy cannot drift from tests or future surfaces.

export const LEASELENS_CAPABILITY_PILLS = [
  { id: 'pdf', label: 'NJ lease PDF' },
  { id: 'clauses', label: 'Clause extraction' },
  { id: 'flags', label: 'Red flags' },
  { id: 'njsa', label: 'NJSA citations' },
] as const;

export const LEASELENS_DATA_PANEL = {
  eyebrow: 'Your lease, your data',
  headline: 'Parsed for review — not added to the law corpus',
  body: 'Your upload is analyzed for clauses and red flags in this session. NJ tenant-law sources power citations; lease PDFs are never embedded into the public RAG index. Informational analysis only, not legal advice.',
} as const;

export const LEASELENS_CAPABILITIES_PANEL = {
  eyebrow: 'What you get',
  headline: 'A full pass before you sign',
  body: 'Upload once. LeaseLens extracts clauses, grades risks, and cites relevant NJ statutes so you know what to negotiate.',
} as const;
