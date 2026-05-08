import {
  AlertTriangle,
  FileText,
  Mail,
  ScrollText,
  Sparkles,
} from 'lucide-react';

interface SuggestedPrompt {
  label: string;
  description: string;
  prompt: string;
  Icon: typeof FileText;
}

// Sprint 13 §3f — LeaseLens empty-state prompts. Replace the
// ContentOps-era brand-onboarding cards with lease-review starters.
// The first card is the headline scan flow; the others are common
// follow-up questions a tenant or reviewer would ask.
function buildSuggestedPrompts(_workspaceName: string): SuggestedPrompt[] {
  return [
    {
      label: 'Run the standard scan',
      description: 'Extract clauses and grade each against NJ tenant law.',
      prompt:
        'Run the standard scan on my active lease — extract the clauses, grade each against NJ tenant law, and list the red flags.',
      Icon: AlertTriangle,
    },
    {
      label: 'Explain a lease term',
      description: 'Plain-English breakdown grounded in NJ statutes.',
      prompt:
        'Explain the security-deposit cap and return rules under NJ tenant law in plain English.',
      Icon: ScrollText,
    },
    {
      label: 'Compare to NJ statute',
      description: 'Cite the supporting NJ statute for any clause.',
      prompt:
        'For each clause you grade, cite the supporting NJ statute and quote the relevant section verbatim.',
      Icon: FileText,
    },
    {
      label: 'Draft a negotiation email',
      description: 'Polite landlord email; you review before sending.',
      prompt:
        'Draft a polite negotiation email to the landlord about the most concerning clause in my lease.',
      Icon: Mail,
    },
  ];
}

interface ChatEmptyStateProps {
  workspaceName: string;
  onSelectPrompt?: (prompt: string) => void;
}

export function ChatEmptyState({
  workspaceName,
  onSelectPrompt,
}: ChatEmptyStateProps) {
  const prompts = buildSuggestedPrompts(workspaceName);
  return (
    <div
      className="flex min-h-[60vh] w-full flex-1 flex-col items-center justify-center px-6 py-12 text-center"
      data-testid="chat-empty-state"
    >
      <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
        <Sparkles className="h-7 w-7" aria-hidden="true" strokeWidth={1.5} />
      </div>

      <h2 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
        {workspaceName}
      </h2>

      <p className="mb-10 max-w-md text-[15px] leading-relaxed text-gray-500">
        Drop a NJ residential lease in the left pane, then ask me to scan it.
        I'll extract clauses, grade each against NJ tenant-law sources, and
        draft negotiation emails for any red flags.
      </p>

      <div className="grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2">
        {prompts.map(({ label, description, prompt, Icon }) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelectPrompt?.(prompt)}
            className="flex items-start gap-3 rounded-lg border border-gray-150 bg-white p-4 text-left transition-all hover:border-indigo-200 hover:bg-indigo-50/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
            <div>
              <div className="text-sm font-semibold text-gray-800">{label}</div>
              <div className="mt-0.5 text-xs leading-relaxed text-gray-400">
                {description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
