// Factory for creating a fully populated ToolRegistry

import type Database from 'better-sqlite3';
import {
  createGetDocumentSummaryTool,
  createListDocumentsTool,
  createSearchCorpusTool,
} from './corpus-tools';
import { ToolRegistry } from './registry';

/**
 * Create a ToolRegistry with all ContentOps tools registered.
 */
export function createToolRegistry(db: Database.Database): ToolRegistry {
  const registry = new ToolRegistry();

  // Register corpus tools
  registry.register(createSearchCorpusTool(db));
  registry.register(createGetDocumentSummaryTool(db));
  registry.register(createListDocumentsTool(db));

  return registry;
}
