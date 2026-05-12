/*
 * Sprint 18 §3 — shared grading display module.
 *
 * Both the right-pane RedFlagReport (curated severity rail) and the
 * in-chat ToolCard polished body need the same severity colour mapping,
 * the same clause-type → human label dictionary, and the same
 * isGradingResult typeguard. Keeping them in one place avoids drift —
 * e.g. RedFlagReport calling a clause "Auto-renewal" while the chat
 * card calls it "Automatic renewal" — and concentrates the change
 * surface when a new clause_type or severity is added on the tool side.
 *
 * Pure module (no JSX): types, constants, and helpers only. The
 * visual components that consume it (RedFlagReport, GradingDetailBlock)
 * own the layout.
 */

export type Severity = 'high' | 'medium' | 'low' | 'ok';

export interface GradingResult {
  clause_id: string;
  severity: Severity;
  statute_citation: string;
  chunk_id: string;
  reasoning: string;
  recommended_action: string;
  clause_type?: string;
  clause_index?: number;
  page_number?: number;
}

export const SEVERITY_ORDER: readonly Severity[] = [
  'high',
  'medium',
  'low',
  'ok',
] as const;

// Tailwind v4 class maps. Values reference the @theme semantic tokens
// declared in globals.css, so dark-mode flips happen automatically via
// the dark: variant — no per-component overrides needed.
export const SEVERITY_BAR: Record<Severity, string> = {
  high: 'bg-danger-600',
  medium: 'bg-warning-600',
  low: 'bg-info-600',
  ok: 'bg-success-600',
};

export const SEVERITY_BADGE: Record<Severity, string> = {
  high: 'bg-danger-100/80 text-danger-600 dark:bg-danger-600/15 dark:text-danger-100',
  medium:
    'bg-warning-100/80 text-warning-600 dark:bg-warning-600/15 dark:text-warning-100',
  low: 'bg-info-100/80 text-info-600 dark:bg-info-600/15 dark:text-info-100',
  ok: 'bg-success-100/80 text-success-600 dark:bg-success-600/15 dark:text-success-100',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'High',
  medium: 'Med',
  low: 'Low',
  ok: 'OK',
};

export const CLAUSE_TYPE_LABEL: Record<string, string> = {
  security_deposit: 'Security deposit',
  late_fee: 'Late fee',
  early_termination: 'Early termination',
  sublet: 'Subletting',
  repair: 'Repairs',
  entry: 'Landlord entry',
  retaliation: 'Retaliation',
  automatic_renewal: 'Auto-renewal',
  attorneys_fees: "Attorneys' fees",
  indemnification: 'Indemnification',
  jury_waiver: 'Jury trial waiver',
  pet: 'Pets',
  parking: 'Parking',
  unknown: 'Other clause',
};

/*
 * Sprint 18 §5 — tenant-friendly stage labels for the ScanTimeline.
 *
 * Distinct from CLAUSE_TYPE_LABEL because the tone is different: card
 * labels are nouns ("Security deposit"), stage labels are verb phrases
 * narrating what the scan is *doing* right now ("Checking security
 * deposit terms"). Some related clause types collapse into one stage
 * (late_fee + attorneys_fees + indemnification → "Reviewing fees and
 * penalties") so the timeline doesn't fragment into 14 micro-rows on a
 * normal lease.
 *
 * TODO: copywriting review before Sprint 18 Phase 2 merge — the more
 * legalese-flavoured terms (indemnification, jury_waiver) need a tenant-
 * friendly framing the team has signed off on.
 */
export const STAGE_LABEL: Record<string, string> = {
  security_deposit: 'Checking security deposit terms',
  late_fee: 'Reviewing fees and penalties',
  attorneys_fees: 'Reviewing fees and penalties',
  indemnification: 'Reviewing fees and penalties',
  early_termination: 'Reviewing termination terms',
  automatic_renewal: 'Reviewing renewal terms',
  sublet: 'Reviewing subletting rules',
  repair: 'Reviewing repair responsibilities',
  entry: 'Reviewing landlord access rules',
  retaliation: 'Reviewing retaliation protections',
  jury_waiver: 'Reviewing dispute-resolution terms',
  pet: 'Reviewing pet and animal rules',
  parking: 'Reviewing parking terms',
  unknown: 'Reviewing other lease terms',
};

/*
 * For clause_types not in STAGE_LABEL (e.g. a new type added on the tool
 * side before the dictionary is updated), fall through to this label so
 * a tenant never sees the raw underscored identifier.
 */
export const STAGE_LABEL_FALLBACK = 'Reviewing other lease terms';

export function isGradingResult(value: unknown): value is GradingResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.clause_id === 'string' &&
    typeof v.severity === 'string' &&
    typeof v.statute_citation === 'string' &&
    SEVERITY_ORDER.includes(v.severity as Severity)
  );
}

/** Human-readable label for the clause: "Security deposit · §3". */
export function clauseLabel(
  g: Pick<GradingResult, 'clause_type' | 'clause_index'>,
): string {
  const typeLabel = g.clause_type
    ? (CLAUSE_TYPE_LABEL[g.clause_type] ?? CLAUSE_TYPE_LABEL.unknown)
    : 'Clause';
  return typeof g.clause_index === 'number'
    ? `${typeLabel} · §${g.clause_index + 1}`
    : typeLabel;
}
