import {
  BookOpen,
  Calendar,
  CheckSquare,
  Map as MapIcon,
  Sparkles,
} from 'lucide-react';

interface SuggestedPrompt {
  label: string;
  description: string;
  prompt: string;
  Icon: typeof BookOpen;
}

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    label: 'Define Brand Voice',
    description: 'Set tone, audience, and editorial guidelines.',
    prompt:
      'Summarize the Side Quest Syndicate brand voice and give me practical writing rules for creators.',
    Icon: BookOpen,
  },
  {
    label: 'Map Content Pillars',
    description: 'Identify core themes and recurring topics.',
    prompt:
      'Map the core content pillars for Side Quest Syndicate and explain what each pillar is for.',
    Icon: MapIcon,
  },
  {
    label: 'Plan First Week',
    description: 'Draft posts and schedule the rollout calendar.',
    prompt:
      'Create a first-week content plan for Side Quest Syndicate using the brand corpus.',
    Icon: Calendar,
  },
  {
    label: 'Review Approval Flow',
    description: 'Configure review stages and sign-off rules.',
    prompt:
      'Explain the approval workflow for Side Quest Syndicate and what an Admin should review before publishing.',
    Icon: CheckSquare,
  },
];

interface ChatEmptyStateProps {
  onSelectPrompt?: (prompt: string) => void;
}

export function ChatEmptyState({ onSelectPrompt }: ChatEmptyStateProps) {
  return (
    <div
      className="flex min-h-[60vh] w-full flex-1 flex-col items-center justify-center px-6 py-12 text-center"
      data-testid="chat-empty-state"
    >
      <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500">
        <Sparkles className="h-7 w-7" aria-hidden="true" strokeWidth={1.5} />
      </div>

      <h2 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
        Side Quest Syndicate
      </h2>

      <p className="mb-10 max-w-md text-[15px] leading-relaxed text-gray-500">
        Your editorial assistant is ready. Define the brand voice, map content
        pillars, plan the first-week calendar, or configure the approval flow.
      </p>

      <div className="grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTED_PROMPTS.map(({ label, description, prompt, Icon }) => (
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
