import { describe, expect, it } from 'vitest';
import type { RetrievedChunk } from '@/lib/rag/retrieve';
import { buildSystemPrompt } from './system-prompt';

describe('buildSystemPrompt', () => {
  it('opens with the LeaseLens identity sentence (Sprint 13 §3h §1)', () => {
    const prompt = buildSystemPrompt('Creator');
    expect(prompt).toContain('LeaseLens');
    expect(prompt).toMatch(/NJ residential lease|New Jersey residential/i);
  });

  it('renders the LeaseLens role labels via labelFor (Tenant/Reviewer/Admin)', () => {
    expect(buildSystemPrompt('Creator')).toMatch(/Tenant/);
    expect(buildSystemPrompt('Editor')).toMatch(/Reviewer/);
    expect(buildSystemPrompt('Admin')).toMatch(/Admin/);
  });

  it('includes the LEASELENS_DISCLAIMER string verbatim (spec §2.8 invariant)', () => {
    const prompt = buildSystemPrompt('Creator');
    expect(prompt.toLowerCase()).toContain('not legal advice');
    expect(prompt).toMatch(/attorney|legal[\s-]aid|clinic/);
  });

  it('names the LeaseLens tool surface and the prescribed call order', () => {
    const prompt = buildSystemPrompt('Creator');
    // Three new tools surface in the prompt; old ContentOps tools do not.
    expect(prompt).toMatch(/extract_clauses/);
    expect(prompt).toMatch(/grade_clause_severity/);
    expect(prompt).toMatch(/draft_negotiation_email/);
    expect(prompt).not.toMatch(/schedule_content_item/);
    expect(prompt).not.toMatch(/approve_draft\b/);
  });

  it('refuses non-NJ leases (spec §2.7)', () => {
    const prompt = buildSystemPrompt('Creator');
    expect(prompt).toMatch(/New Jersey|NJ-only|NJ\b/);
    expect(prompt).toMatch(/refuse|decline/i);
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

  it('parameterizes on a workspace via options-object signature (Sprint 11; Sprint 13 prose update)', () => {
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
    // Sprint 13 — workspace name appears in the active-workspace section.
    expect(prompt).toContain('The active workspace is Acme.');
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
    // Sprint 13: the description appears in the LeaseLens identity sentence
    // (not as a "brand-onboarding" tagline).
    expect(withPeriod).toContain('A demo brand.');
    expect(withPeriod).not.toContain('A demo brand..');
    expect(withoutPeriod).toContain('A demo brand.');
    expect(withoutPeriod).not.toContain('A demo brand..');
  });

  it('mentions render_workflow_diagram and the LeaseLens diagram shapes (Sprint 13)', () => {
    const prompt = buildSystemPrompt('Creator');
    expect(prompt).toMatch(/render_workflow_diagram/);
    // Sprint 13 §3f: LeaseLens repurposes the diagram tool for a clause-
    // dependency map and a severity heatmap.
    expect(prompt).toMatch(/clause|severity|heatmap|dependency/i);
  });
});
