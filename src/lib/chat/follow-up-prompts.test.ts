// S19.2 — suggested-action catalogs for the Tenant-Friendly
// Conversational Scan flow.
//
// Two ordered tuples live alongside the legacy FOLLOW_UP_PROMPTS:
//   * SCAN_INTRO_PROMPTS — the 4 actions offered when the synthetic
//     "Lease uploaded" message appears in the chat.
//   * SCAN_COMPLETE_PROMPTS — the 4 actions offered when the synthetic
//     scan-complete summary appears.
//
// These are pure data — no React, no DOM — so they unit-test as a
// straight assertion against the exported constants.

import { describe, expect, it } from 'vitest';
import {
  type FollowUpPrompt,
  SCAN_COMPLETE_PROMPTS,
  SCAN_INTRO_PROMPTS,
} from './follow-up-prompts';

describe('SCAN_INTRO_PROMPTS', () => {
  it('exposes exactly 4 prompts in the order spec-§"Proposed UX" prescribes', () => {
    expect(SCAN_INTRO_PROMPTS).toHaveLength(4);
    const labels = SCAN_INTRO_PROMPTS.map((p) => p.label);
    expect(labels[0]).toMatch(/standard scan|run.*scan/i);
    expect(labels.some((l) => /clause/i.test(l))).toBe(true);
    expect(labels.some((l) => /NJ|statute|law/i.test(l))).toBe(true);
    expect(labels.some((l) => /email|negoti/i.test(l))).toBe(true);
  });

  it('each prompt has a non-empty id, label, and prompt string', () => {
    for (const p of SCAN_INTRO_PROMPTS) {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.prompt.length).toBeGreaterThan(0);
    }
  });

  it('prompt ids are unique across the catalog', () => {
    const ids = SCAN_INTRO_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('typed FollowUpPrompt[] (same shape as the legacy catalog)', () => {
    const _typecheck: FollowUpPrompt[] = SCAN_INTRO_PROMPTS;
    expect(_typecheck).toBeDefined();
  });
});

describe('SCAN_COMPLETE_PROMPTS', () => {
  it('exposes exactly 4 prompts covering the post-scan next-actions', () => {
    expect(SCAN_COMPLETE_PROMPTS).toHaveLength(4);
    const labels = SCAN_COMPLETE_PROMPTS.map((p) => p.label);
    expect(labels.some((l) => /explain|highest|top/i.test(l))).toBe(true);
    expect(labels.some((l) => /email/i.test(l))).toBe(true);
    expect(labels.some((l) => /high[- ]severity|show.*high/i.test(l))).toBe(
      true,
    );
    expect(labels.some((l) => /NJ|statute|law|compare/i.test(l))).toBe(true);
  });

  it('each prompt has a non-empty id, label, and prompt string', () => {
    for (const p of SCAN_COMPLETE_PROMPTS) {
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.prompt.length).toBeGreaterThan(0);
    }
  });

  it('prompt ids are unique across the catalog', () => {
    const ids = SCAN_COMPLETE_PROMPTS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prompts reference tools the assistant can actually invoke', () => {
    // The chips are user-facing instructions sent verbatim to the
    // composer; their bodies should explicitly name the tool the
    // agent must call so the agent doesn't paraphrase the action
    // back to the user instead of executing.
    const joined = SCAN_COMPLETE_PROMPTS.map((p) => p.prompt).join('\n');
    expect(joined).toMatch(/draft_negotiation_email|search_corpus/);
  });
});
