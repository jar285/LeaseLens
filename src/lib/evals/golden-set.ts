import type { GoldenCase } from './domain';

export const GOLDEN_SET: GoldenCase[] = [
  {
    id: 'brand-voice',
    query: 'What is our brand voice?',
    expectedChunkIds: [
      'brand-identity#section:3', // Brand Voice
      'brand-identity#section:1', // Mission Statement
    ],
    expectedKeywords: ['conversational', 'knowledgeable', 'friend'],
    k: 5,
  },
  {
    id: 'content-pillars',
    query: 'What topics do we cover?',
    expectedChunkIds: [
      'content-pillars#section:3', // Pillar 3: News and Industry Commentary
      'content-pillars#section:0', // Intro — mentions pillars
    ],
    expectedKeywords: ['pillar', 'coverage', 'community'],
    k: 5,
  },
  {
    id: 'style-tone',
    query: 'What tone should we use in articles?',
    expectedChunkIds: [
      'style-guide#section:0', // Intro
      'style-guide#section:1', // Tone of Voice
    ],
    expectedKeywords: ['conversational', 'authority', 'contractions'],
    k: 5,
  },
  {
    id: 'audience-who',
    query: 'Who is our target audience?',
    expectedChunkIds: [
      'audience-profile#section:0', // Intro — who we write for
      'audience-profile#section:2', // Secondary Audience: The Curious Newcomer
    ],
    expectedKeywords: ['player', 'community', 'audience'],
    k: 5,
  },
  {
    id: 'calendar-schedule',
    query: 'When are articles published?',
    expectedChunkIds: [
      'content-calendar#passage:0', // Weekly Cadence (first passage)
      'content-calendar#section:1', // Approval Workflow
    ],
    expectedKeywords: ['publish', 'schedule', 'editorial'],
    k: 5,
  },
];
