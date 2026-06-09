// Sprint 45 — wiring guard: the chat route builds its tool surface via
// createToolRegistry, so the get_lease_findings read tool (which lets the model
// answer finding questions WITHOUT re-running the scan) must be registered and
// reachable by every role. The "model prefers it over a re-scan" behaviour is
// steered by the system prompt (system-prompt.test.ts) and confirmed live; here
// we pin only that the route can reach the tool.

import { describe, expect, it } from 'vitest';
import { createTestDb } from '@/lib/test/db';
import { createToolRegistry } from './create-registry';

describe('createToolRegistry', () => {
  it('registers get_lease_findings alongside the existing lease + corpus tools', () => {
    const registry = createToolRegistry(createTestDb());
    const names = registry.getToolNames();

    expect(names).toContain('get_lease_findings');

    // The pre-Sprint-45 surface is intact (no tool dropped).
    for (const name of [
      'search_corpus',
      'get_document_summary',
      'list_documents',
      'render_workflow_diagram',
      'extract_clauses',
      'grade_clause_severity',
      'draft_negotiation_email',
    ]) {
      expect(names).toContain(name);
    }
  });

  it('exposes get_lease_findings to every role (read-only, ALL)', () => {
    const registry = createToolRegistry(createTestDb());
    for (const role of ['Tenant', 'Reviewer', 'Admin'] as const) {
      expect(registry.getToolsForRole(role).map((t) => t.name)).toContain(
        'get_lease_findings',
      );
      expect(registry.canExecute('get_lease_findings', role)).toBe(true);
    }
  });
});
