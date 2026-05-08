// Sprint 14 / Phase 11 — Tier 1 retrieval golden set, 12 NJ tenant-law
// cases. Replaces the 5 ContentOps "Side Quest Syndicate" cases. One
// case per issue family from spec §3d, plus 1 cross-cutting case
// (habitability) for a 12-row total.
//
// Each case asks the kind of natural-language question a NJ tenant
// would type into the chat. expectedChunkIds reference real chunks
// from src/corpus/nj-tenant-law/ (verify with `sqlite3 data/leaselens.db
// "SELECT id FROM chunks ORDER BY document_id, chunk_index"` after
// seeding). expectedKeywords are substring-matched (lowercased) against
// the retrieved chunks' content — they should appear when the right
// chunks come back. k=5 across all cases keeps the eval comparable.

import type { GoldenCase } from './domain';

export const GOLDEN_SET: GoldenCase[] = [
  {
    id: 'security-deposit-cap',
    query: 'How much can a NJ landlord legally charge for a security deposit?',
    expectedChunkIds: [
      'security-deposit-cap#section:1', // Statutory cap
    ],
    expectedKeywords: ['1.5', 'security deposit', 'monthly rent'],
    k: 5,
  },
  {
    id: 'security-deposit-return',
    query:
      'When does my landlord have to return my security deposit after I move out, and is interest required?',
    expectedChunkIds: [
      'security-deposit-return#section:1',
      'security-deposit-interest#section:2',
    ],
    expectedKeywords: ['30 days', 'interest', 'itemized'],
    k: 5,
  },
  {
    id: 'late-fee-grace-period',
    query: 'What are the rules around late rent fees and grace periods in NJ?',
    expectedChunkIds: [
      'late-fees-grace-period#section:1', // What "grace period" means
      'late-fees-grace-period#section:5', // Common red flags
    ],
    expectedKeywords: ['grace period', 'late fee', 'reasonable'],
    k: 5,
  },
  {
    id: 'early-termination',
    query:
      'Can I break my lease early in New Jersey, and what penalties can the landlord charge?',
    expectedChunkIds: [
      'early-termination-general#section:1',
      'early-termination-general#section:3',
    ],
    expectedKeywords: ['mitigate', 'damages', 'lease term'],
    k: 5,
  },
  {
    id: 'sublet-consent',
    query: 'Can my landlord prohibit me from subletting my apartment in NJ?',
    expectedChunkIds: [
      'subletting-consent#section:1',
      'subletting-consent#section:2',
    ],
    expectedKeywords: ['consent', 'reasonable', 'sublet'],
    k: 5,
  },
  {
    id: 'repair-and-deduct',
    query:
      "My landlord won't fix the heat. Can I get repairs and deduct the cost from my rent?",
    expectedChunkIds: [
      'repair-and-deduct#section:1',
      'repair-and-deduct#section:2',
    ],
    expectedKeywords: ['habitability', 'repair', 'deduct'],
    k: 5,
  },
  {
    id: 'entry-notice',
    query: 'How much notice must a NJ landlord give before entering my unit?',
    expectedChunkIds: ['entry-notice#section:1', 'entry-notice#section:2'],
    expectedKeywords: ['notice', 'entry', 'quiet enjoyment'],
    k: 5,
  },
  {
    id: 'retaliation-protection',
    query:
      'Can my landlord evict me for complaining about repairs to the housing inspector?',
    expectedChunkIds: ['retaliation-protection#section:2'], // Protected activities
    // Substrings (not whole words) — match "protect" inside "protects" /
    // "protected" / "protection" and "complain" inside "complaining" /
    // "complainant". Avoids brittle keyword/inflection mismatches.
    expectedKeywords: ['retaliation', 'protect', 'complain'],
    k: 5,
  },
  {
    id: 'automatic-renewal',
    query:
      'My lease has an automatic-renewal clause. Is that enforceable in NJ?',
    expectedChunkIds: [
      'automatic-renewal-notice#section:2',
      'automatic-renewal-notice#section:4',
    ],
    expectedKeywords: ['automatic', 'renewal', 'opt'],
    k: 5,
  },
  {
    id: 'attorneys-fees',
    query:
      "My lease says I have to pay the landlord's attorney fees if there is a dispute. Is this allowed?",
    expectedChunkIds: [
      'attorneys-fees-clauses#section:1',
      'attorneys-fees-clauses#section:4',
    ],
    expectedKeywords: ['reciprocal', 'attorney', 'one-way'],
    k: 5,
  },
  {
    id: 'indemnification',
    query:
      'My lease has an indemnification clause that says I have to defend the landlord against all claims. Is that valid in NJ?',
    expectedChunkIds: [
      'indemnification-clauses#section:2',
      'indemnification-clauses#section:4',
    ],
    expectedKeywords: ['indemnification', 'narrow', 'negligence'],
    k: 5,
  },
  {
    id: 'jury-trial-waiver',
    query:
      'Can a residential lease force me to waive my right to a jury trial?',
    expectedChunkIds: [
      'jury-trial-waivers#section:0',
      'jury-trial-waivers#section:1',
    ],
    expectedKeywords: ['jury', 'waiver', 'unenforceable'],
    k: 5,
  },
];
