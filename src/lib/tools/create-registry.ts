// Factory for creating a fully populated ToolRegistry
//
// Sprint 13 (charter v1.13): the ContentOps mutating tools
// (`schedule_content_item`, `approve_draft`) are deregistered. The three
// LeaseLens tools take their place; the read-only corpus tools and the
// visualization tool stay. Total surface: 7 tools (4 retained + 3 new).

import type Database from 'better-sqlite3';
import { getAnthropicClient } from '@/lib/anthropic/client';
import { meterAnthropicClient } from '@/lib/anthropic/metered-client';
import {
  createGetDocumentSummaryTool,
  createListDocumentsTool,
  createSearchCorpusTool,
} from './corpus-tools';
import { createRenderWorkflowDiagramTool } from './diagram-tools';
import {
  type AnthropicLike,
  createDraftNegotiationEmailTool,
  createExtractClausesTool,
  createGetLeaseFindingsTool,
  createGradeClauseSeverityTool,
} from './lease-tools';
import { ToolRegistry } from './registry';

/**
 * Create a ToolRegistry with all LeaseLens tools registered.
 *
 * @param db        Database handle (passed to every tool factory).
 * @param anthropic Optional Anthropic client. Defaults to the lazily-
 *                  resolved singleton from `getAnthropicClient()`. Tests
 *                  may inject a deterministic stub.
 */
export function createToolRegistry(
  db: Database.Database,
  anthropic?: AnthropicLike,
): ToolRegistry {
  const registry = new ToolRegistry(db);

  // Read-only corpus tools (retained from ContentOps; descriptions
  // remain accurate because the corpus content swap doesn't change
  // their behavior — they search whatever's in `documents`/`chunks`).
  registry.register(createSearchCorpusTool(db));
  registry.register(createGetDocumentSummaryTool(db));
  registry.register(createListDocumentsTool(db));

  // Sprint 12 — visualization tool (retained).
  registry.register(createRenderWorkflowDiagramTool(db));

  // Sprint 13 — LeaseLens tools.
  // The Anthropic-using tools accept the client as a constructor arg so
  // the lazy resolution and the test-injection path share one shape.
  // Sprint A.5a (#5a) — route the tool client through the metered gateway so
  // grade_clause_severity / draft_negotiation_email calls are recorded to
  // spend (they previously bypassed tracking). Wrapping here — the composition
  // root — meters BOTH the lazy production client and any injected client (GoF
  // Facade: one metered choke point).
  const llm = meterAnthropicClient(anthropic ?? lazyAnthropic());
  registry.register(createExtractClausesTool(db));
  // Sprint 45 — read-only findings tool (no llm): lets the chat answer
  // finding questions from stored gradings instead of re-running the scan.
  registry.register(createGetLeaseFindingsTool(db));
  registry.register(createGradeClauseSeverityTool(db, llm));
  registry.register(createDraftNegotiationEmailTool(db, llm));

  return registry;
}

/**
 * Lazy-resolved Anthropic client. The singleton from
 * `getAnthropicClient()` requires an API key; we don't want building a
 * registry to throw when constructed for tests / contexts that won't
 * actually invoke an Anthropic-using tool. The proxy resolves on first
 * `messages.create` access.
 */
function lazyAnthropic(): AnthropicLike {
  return {
    messages: {
      create: (args) => {
        const real = getAnthropicClient();
        // The real SDK's create signature differs from `unknown` by
        // type, but at runtime the passed args object is the same shape.
        return (
          real.messages.create as unknown as (a: unknown) => Promise<{
            content: Array<{ type: string; text?: string }>;
          }>
        )(args);
      },
    },
  };
}
