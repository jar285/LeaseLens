// Sprint 13 §3c — naive keyword classifier across the 13 known clause
// families plus 'unknown'. Each family carries a small set of
// distinctive lowercase keywords; the first match wins. Order matters
// when keyword sets could collide (e.g., "fee" appears in late_fee,
// pet, attorneys_fees), so the more-specific phrases are listed first.

export const CLAUSE_TYPES = [
  'security_deposit',
  'late_fee',
  'early_termination',
  'sublet',
  'repair',
  'entry',
  'retaliation',
  'automatic_renewal',
  'attorneys_fees',
  'indemnification',
  'jury_waiver',
  'pet',
  'parking',
  'unknown',
] as const;

export type ClauseType = (typeof CLAUSE_TYPES)[number];

interface Rule {
  type: Exclude<ClauseType, 'unknown'>;
  // Match if the lowercased text contains EVERY phrase in `all`, OR
  // ANY phrase in `any`.
  all?: string[];
  any?: string[];
}

// Order matters: the first matching rule wins. More specific / multi-
// word matches are listed before broad single-word ones so the
// classifier is greedy on specificity.
const RULES: Rule[] = [
  { type: 'jury_waiver', any: ['jury', 'trial by jury'] },
  { type: 'attorneys_fees', any: ['attorneys fees', "attorney's fees"] },
  {
    type: 'indemnification',
    any: ['indemnify', 'indemnification', 'hold harmless'],
  },
  {
    type: 'automatic_renewal',
    any: ['automatically renew', 'automatic renewal'],
  },
  {
    type: 'early_termination',
    any: ['early termination', 'terminate this lease early'],
  },
  { type: 'security_deposit', any: ['security deposit'] },
  { type: 'late_fee', any: ['late fee', 'late payment'] },
  { type: 'sublet', any: ['sublet', 'sublease', 'assign any portion'] },
  { type: 'retaliation', any: ['retaliat'] },
  // entry is checked BEFORE repair because lease language commonly
  // pairs "enter the premises … to inspect or repair", which would
  // otherwise be miscaught by the broad 'repair' keyword.
  {
    type: 'entry',
    any: [
      'enter the premises',
      'entering the premises',
      'right of entry',
      'notice to enter',
      'access to the premises',
    ],
  },
  { type: 'repair', any: ['habitable', 'repair', 'maintain the premises'] },
  { type: 'pet', any: ['pet fee', 'pets are', 'pet deposit', 'no pets'] },
  { type: 'parking', any: ['parking space', 'parking is', 'assigned parking'] },
];

export function classifyClause(text: string): ClauseType {
  if (!text) return 'unknown';
  const haystack = text.toLowerCase();

  for (const rule of RULES) {
    if (rule.all?.every((p) => haystack.includes(p))) {
      return rule.type;
    }
    if (rule.any?.some((p) => haystack.includes(p))) {
      return rule.type;
    }
  }
  return 'unknown';
}
