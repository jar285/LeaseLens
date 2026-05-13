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

// S19.2 — chips shown under the synthetic "Lease uploaded" message
// before the user has triggered a scan. The first option is the
// dominant action; the other three are off-ramps for users who want
// to do something other than the full scan first.
export const SCAN_INTRO_PROMPTS: FollowUpPrompt[] = [
  {
    id: 'scan-intro-run',
    label: 'Run standard scan',
    prompt:
      'Run a standard scan on this lease: extract the clauses, grade each one against NJ tenant-law sources, and surface the red flags in the right panel.',
  },
  {
    id: 'scan-intro-ask-clause',
    label: 'Ask about a clause',
    prompt:
      'Without grading the whole lease yet, can you list the clauses you can see in this lease? I want to point you at one specific clause to discuss before running the full scan.',
  },
  {
    id: 'scan-intro-compare-nj',
    label: 'Compare to NJ statute',
    prompt:
      'Use search_corpus to pull the most important NJ tenant-law provisions a residential lease should comply with, then explain in plain English which provisions I should know about before reading my lease.',
  },
  {
    id: 'scan-intro-draft-email',
    label: 'Draft a negotiation email',
    prompt:
      'I want to negotiate one thing with my landlord before signing. Ask me which clause concerns me most, then call draft_negotiation_email with my answer and the relevant NJ statute.',
  },
];

// S20.5 — chips shown under the synthetic scan-PARTIAL summary.
// Same four "next actions" as scan-complete, except the second slot
// surfaces the skipped clauses so the tenant can manually triage what
// the automated pass couldn't.
export const SCAN_PARTIAL_PROMPTS: FollowUpPrompt[] = [
  {
    id: 'scan-partial-explain-top',
    label: 'Explain highest-risk issue',
    prompt:
      'Walk me through the highest-severity finding from the partial scan in plain English. Why does it matter for me as a NJ tenant?',
  },
  {
    id: 'scan-partial-review-skipped',
    label: 'Review skipped clauses',
    prompt:
      'List the clauses you could not grade automatically and explain in plain English what each one says so I can decide whether to flag it manually.',
  },
  {
    id: 'scan-partial-draft-email',
    label: 'Draft a negotiation email',
    prompt:
      'Draft a polished negotiation email for the highest-severity clause from the scan. Call draft_negotiation_email and pass the grading reasoning + statute citation.',
  },
  {
    id: 'scan-partial-compare-nj',
    label: 'Compare to NJ law',
    prompt:
      'For the highest-severity clause, use search_corpus to pull the NJ statute it conflicts with and show me what the lease says vs. what NJ law requires.',
  },
];

// S19.2 — chips shown under the synthetic scan-complete summary.
// These match the four "next-action" affordances called out in the
// brief (explain top issue / draft emails / show all high-sev /
// compare to NJ law).
export const SCAN_COMPLETE_PROMPTS: FollowUpPrompt[] = [
  {
    id: 'scan-complete-explain-top',
    label: 'Explain highest-risk issue',
    prompt:
      'Walk me through the highest-severity finding from the scan in plain English. No legalese — tell me what it means for me as a NJ tenant and why it matters.',
  },
  {
    id: 'scan-complete-draft-emails',
    label: 'Draft a negotiation email',
    prompt:
      'Draft a polished negotiation email for the highest-severity clause. Call draft_negotiation_email and pass the grading reasoning + statute citation so the email is grounded in the specific concern.',
  },
  {
    id: 'scan-complete-show-high',
    label: 'Show all high-severity clauses',
    prompt:
      'List every high-severity clause from the scan with a one-sentence summary of why it is high severity. Reference the same clause titles shown in the right-pane red flags.',
  },
  {
    id: 'scan-complete-compare-nj',
    label: 'Compare to NJ law',
    prompt:
      'For the highest-severity clause, use search_corpus to pull the NJ statute it conflicts with and show me side-by-side what the lease says vs. what NJ law requires.',
  },
];

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
