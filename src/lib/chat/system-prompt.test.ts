import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '@/lib/rag/retrieve';
import { buildSystemPrompt } from './system-prompt';

describe('buildSystemPrompt', () => {
  it('includes the brand name', () => {
    const prompt = buildSystemPrompt('Creator');
    expect(prompt).toContain('Side Quest Syndicate');
  });

  it('injects the role into the output', () => {
    expect(buildSystemPrompt('Creator')).toContain('role is Creator');
    expect(buildSystemPrompt('Editor')).toContain('role is Editor');
    expect(buildSystemPrompt('Admin')).toContain('role is Admin');
  });

  it('includes a UTC date in YYYY-MM-DD format', () => {
    const prompt = buildSystemPrompt('Creator');
    expect(prompt).toMatch(/Today's date: \d{4}-\d{2}-\d{2}/);
  });

  it('produces different output for different roles', () => {
    const creator = buildSystemPrompt('Creator');
    const admin = buildSystemPrompt('Admin');
    expect(creator).not.toBe(admin);
  });

  it('includes <context> block when chunks provided', () => {
    const mockChunks: RetrievedChunk[] = [
      {
        chunkId: 'brand-identity#section:0',
        documentSlug: 'brand-identity',
        heading: 'Brand Voice',
        content: 'We write like a knowledgeable friend.',
        rrfScore: 0.05,
        vectorRank: 1,
        bm25Rank: 1,
      },
    ];
    const prompt = buildSystemPrompt('Creator', mockChunks);
    expect(prompt).toContain('<context>');
    expect(prompt).toContain('[1] brand-identity > Brand Voice');
  });

  it('omits <context> block when no chunks provided', () => {
    const prompt = buildSystemPrompt('Creator');
    expect(prompt).not.toContain('<context>');
  });
});
