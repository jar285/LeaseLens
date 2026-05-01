#!/usr/bin/env node
// ContentOps MCP Server
// Exposes read-only corpus tools over the Model Context Protocol (stdio transport)
// Usage: npx tsx mcp/contentops-server.ts

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import { join } from 'path';
import { z } from 'zod';
import type { Role } from '../src/lib/auth/types';
import { createToolRegistry } from '../src/lib/tools/create-registry';

// Database path - uses same DB as the main app
const DB_PATH = join(process.cwd(), 'data', 'contentops.db');

// MCP context (no real auth in stdio mode, assume Admin for broadest access)
const MCP_CONTEXT = {
  role: 'Admin' as Role,
  userId: 'mcp-server',
  conversationId: 'mcp-session',
};

async function main() {
  // Initialize database
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create tool registry
  const registry = createToolRegistry(db);

  // Create MCP server
  const server = new McpServer({
    name: 'contentops',
    version: '1.0.0',
  });

  // Register search_corpus tool
  server.registerTool(
    'search_corpus',
    {
      description:
        'Search the content corpus using hybrid retrieval (semantic + keyword). Returns relevant text chunks with metadata.',
      inputSchema: {
        query: z.string().describe('Search query to find relevant content'),
        max_results: z
          .number()
          .min(1)
          .max(10)
          .optional()
          .describe(
            'Maximum number of results to return (default: 5, max: 10)',
          ),
      },
    },
    async ({ query, max_results }: { query: string; max_results?: number }) => {
      try {
        const { result } = await registry.execute(
          'search_corpus',
          { query, max_results },
          MCP_CONTEXT,
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error instanceof Error ? error.message : 'Search failed',
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Register get_document_summary tool
  server.registerTool(
    'get_document_summary',
    {
      description:
        'Get a summary of a specific document by its slug. Returns title, chunk count, and content preview.',
      inputSchema: {
        slug: z.string().describe('Document slug (URL-friendly identifier)'),
      },
    },
    async ({ slug }: { slug: string }) => {
      try {
        const { result } = await registry.execute(
          'get_document_summary',
          { slug },
          MCP_CONTEXT,
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : 'Failed to get summary',
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Register list_documents tool
  server.registerTool(
    'list_documents',
    {
      description:
        'List all documents in the corpus with their titles, slugs, and chunk counts.',
      inputSchema: {},
    },
    async () => {
      try {
        const { result } = await registry.execute(
          'list_documents',
          {},
          MCP_CONTEXT,
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  error instanceof Error
                    ? error.message
                    : 'Failed to list documents',
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Sprint 8: register mutating tools. audit_id is intentionally dropped
  // at the MCP boundary — MCP clients see only the raw tool result.
  server.registerTool(
    'schedule_content_item',
    {
      description:
        'Schedule a content item for publication on a given channel and time. Mutating: produces an audit_log row.',
      inputSchema: {
        document_slug: z.string().describe('Slug of the document to schedule.'),
        scheduled_for: z
          .string()
          .describe(
            'ISO 8601 datetime when to publish (e.g. "2026-05-02T09:00:00Z"). Server parses this.',
          ),
        channel: z
          .string()
          .describe('Channel identifier (e.g., "twitter", "rss").'),
      },
    },
    async ({
      document_slug,
      scheduled_for,
      channel,
    }: {
      document_slug: string;
      scheduled_for: string;
      channel: string;
    }) => {
      try {
        const { result } = await registry.execute(
          'schedule_content_item',
          { document_slug, scheduled_for, channel },
          MCP_CONTEXT,
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  error instanceof Error ? error.message : 'Schedule failed',
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'approve_draft',
    {
      description:
        'Approve a draft document for publication. Admin-only; mutating; produces an audit_log row.',
      inputSchema: {
        document_slug: z.string().describe('Slug of the document to approve.'),
        notes: z.string().optional().describe('Optional approval notes.'),
      },
    },
    async ({
      document_slug,
      notes,
    }: {
      document_slug: string;
      notes?: string;
    }) => {
      try {
        const { result } = await registry.execute(
          'approve_draft',
          { document_slug, notes },
          MCP_CONTEXT,
        );
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error:
                  error instanceof Error ? error.message : 'Approval failed',
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for JSON-RPC)
  console.error('ContentOps MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
