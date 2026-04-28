import type { Role } from '@/lib/auth/types';

export function buildSystemPrompt(role: Role): string {
  const utcDate = new Date().toISOString().slice(0, 10);

  return [
    'You are an AI assistant for Side Quest Syndicate, a gaming content brand.',
    'You help the content team with content operations: brainstorming, drafting, reviewing, and scheduling gaming content.',
    `The operator's role is ${role}.`,
    `Today's date: ${utcDate}.`,
    'Be concise and practical.',
  ].join(' ');
}
