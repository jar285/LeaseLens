// Sprint 41 — the NJ tenant-law sources behind LeaseLens citations, for
// /sources ("further reading"). Grounded in the seeded corpus
// (src/corpus/nj-tenant-law); each statute was verified against its source
// file. These are orientation pointers — read the statute itself for the
// controlling text.

export const LEASELENS_NJ_SOURCES = [
  {
    id: 'security-deposit',
    citation: 'N.J.S.A. 46:8-19 to 46:8-26',
    title: 'Security Deposit Law',
    note: "Caps the deposit at 1.5 months' rent (46:8-21.2), requires interest (46:8-19), and a written, itemized return within 30 days of move-out (46:8-21.1).",
  },
  {
    id: 'truth-in-renting',
    citation: 'N.J.S.A. 46:8-43 to 46:8-50',
    title: 'Truth in Renting Act',
    note: 'Requires landlords to give tenants a current statement of their rights and responsibilities under NJ law.',
  },
  {
    id: 'anti-eviction',
    citation: 'N.J.S.A. 2A:18-61.1 et seq.',
    title: 'Anti-Eviction Act',
    note: 'Limits residential eviction to specific "good cause" grounds — one of the strongest tenant protections in the country.',
  },
  {
    id: 'anti-retaliation',
    citation: 'N.J.S.A. 2A:42-10.10',
    title: 'Anti-Retaliation Statute',
    note: 'Bars retaliatory eviction, rent increases, or service cuts against tenants who exercise protected rights.',
  },
  {
    id: 'anti-lockout',
    citation: 'N.J.S.A. 2A:39-1',
    title: 'Anti-Lockout / Unlawful Entry',
    note: 'Prohibits self-help lockouts; a landlord must use the court process and respect notice before entering.',
  },
  {
    id: 'habitability',
    citation: 'Marini v. Ireland, 56 N.J. 130 (1970)',
    title: 'Implied Warranty of Habitability',
    note: 'Establishes the tenant right to a habitable home and the repair-and-deduct remedy for unaddressed defects.',
  },
  {
    id: 'early-termination',
    citation: 'N.J.S.A. 46:8-9.1 & 46:8-9.6',
    title: 'Early Termination Protections',
    note: 'Lets senior or disabled tenants (9.1) and domestic-violence victims (9.6) end a lease early under defined conditions.',
  },
] as const;
