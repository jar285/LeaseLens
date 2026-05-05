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

  it('parameterizes on a workspace via options-object signature (Sprint 11)', () => {
    const prompt = buildSystemPrompt({
      role: 'Editor',
      workspace: {
        id: 'ws-acme',
        name: 'Acme',
        description: 'A test brand for measurement',
        is_sample: 0,
        created_at: 0,
        expires_at: 9_999_999_999,
      },
    });
    expect(prompt).toContain('You are an AI assistant for Acme');
    expect(prompt).toContain('A test brand for measurement.');
    expect(prompt).not.toContain('Side Quest Syndicate');
  });

  it('description normalization: trailing period in input does not double-period the output (sprint-QA L1)', () => {
    const withPeriod = buildSystemPrompt({
      role: 'Editor',
      workspace: {
        id: 'ws-acme',
        name: 'Acme',
        description: 'A demo brand.',
        is_sample: 0,
        created_at: 0,
        expires_at: null,
      },
    });
    const withoutPeriod = buildSystemPrompt({
      role: 'Editor',
      workspace: {
        id: 'ws-acme',
        name: 'Acme',
        description: 'A demo brand',
        is_sample: 0,
        created_at: 0,
        expires_at: null,
      },
    });
    // Both produce exactly one trailing period after the description sentence.
    expect(withPeriod).toContain('Acme. A demo brand.');
    expect(withPeriod).not.toContain('A demo brand..');
    expect(withoutPeriod).toContain('Acme. A demo brand.');
  });
});
