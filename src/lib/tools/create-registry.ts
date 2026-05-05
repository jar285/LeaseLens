// Factory for creating a fully populated ToolRegistry

import type Database from 'better-sqlite3';
import {
  createGetDocumentSummaryTool,
  createListDocumentsTool,
  createSearchCorpusTool,
} from './corpus-tools';
import { createRenderWorkflowDiagramTool } from './diagram-tools';
import {
  createApproveDraftTool,
  createScheduleContentItemTool,
} from './mutating-tools';
import { ToolRegistry } from './registry';

/**
 * Create a ToolRegistry with all ContentOps tools registered.
 *
 * Sprint 8: forwards `db` to the registry constructor so the registry
 * can write audit_log rows for mutating tools.
 */
export function createToolRegistry(db: Database.Database): ToolRegistry {
  const registry = new ToolRegistry(db);

  // Register read-only corpus tools
  registry.register(createSearchCorpusTool(db));
  registry.register(createGetDocumentSummaryTool(db));
  registry.register(createListDocumentsTool(db));

  // Register mutating tools (Sprint 8)
  registry.register(createScheduleContentItemTool(db));
  registry.register(createApproveDraftTool(db));

  // Register visualization tools (Sprint 12)
  registry.register(createRenderWorkflowDiagramTool(db));

  return registry;
}
