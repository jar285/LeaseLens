// Phase 10.8 — LeaseLens-flavored follow-ups. The previous set was
// inherited from ContentOps ("Refine this" / "Show alternatives" /
// "Continue") and didn't map to anything a NJ tenant would actually
// want next after seeing a graded red-flag report. Each prompt below
// triggers a concrete, tenant-relevant continuation that the agent
// can fulfil with the existing tool surface (draft_negotiation_email,
// search_corpus, grade_clause_severity).

export interface FollowUpPrompt {
  id: string;
  label: string;
  prompt: string;
}

export const FOLLOW_UP_PROMPTS: FollowUpPrompt[] = [
  {
    id: 'draft-emails',
    label: 'Draft emails',
    prompt:
      'Draft polished negotiation emails for each high-severity clause you just graded. Call draft_negotiation_email once per clause and pass the grading reasoning + statute citation so the email is grounded in the specific concern.',
  },
  {
    id: 'plain-english',
    label: 'In plain English',
    prompt:
      'Walk me through the highest-severity finding in plain English — no legalese — and explain what it means for me as a NJ tenant signing this lease.',
  },
  {
    id: 'compare-nj',
    label: 'Compare to NJ law',
    prompt:
      'For each high-severity clause, show me what a standard NJ-compliant version of that clause would look like. Use search_corpus to ground each comparison in the actual statute.',
  },
  {
    id: 'prioritize',
    label: 'What to fix first',
    prompt:
      'Rank the red flags by which one I should push back on first. Consider both severity and how realistic it is to get the change. Give me the top 3 with one-sentence rationale each.',
  },
];
