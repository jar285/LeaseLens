// Corpus tools - read-only tools for content operations
// Adapted from docs/_references/ai_mcp_chat_ordo/src/core/use-cases/tools/CorpusTools.ts
// Simplified: uses existing retrieve() function instead of separate SearchHandler

import type Database from 'better-sqlite3';
import { retrieve } from '@/lib/rag/retrieve';
import type { ToolDescriptor } from './domain';

/**
 * Tool: search_corpus
 * Roles: ALL (Creator, Editor, Admin)
 * Searches the corpus using hybrid retrieval (vector + BM25).
 */
export function createSearchCorpusTool(db: Database.Database): ToolDescriptor {
  return {
    name: 'search_corpus',
    description:
      'Search the content corpus using hybrid retrieval (semantic + keyword). Returns relevant text chunks with metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant content',
        },
        max_results: {
          type: 'number',
          description:
            'Maximum number of results to return (default: 5, max: 10)',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['query'],
    } as const,
    roles: 'ALL',
    category: 'corpus',
    execute: async (input, ctx) => {
      const query = String(input.query ?? '');
      const maxResults = Math.min(Number(input.max_results ?? 5), 10);

      if (!query.trim()) {
        return { results: [], query, error: 'Query cannot be empty' };
      }

      try {
        const chunks = await retrieve(query, db, {
          workspaceId: ctx.workspaceId,
          maxResults,
        });

        return {
          query,
          result_count: chunks.length,
          results: chunks.map((chunk) => ({
            chunk_id: chunk.chunkId,
            document_slug: chunk.documentSlug,
            heading: chunk.heading,
            content: chunk.content,
            score: chunk.rrfScore,
          })),
        };
      } catch (error) {
        return {
          query,
          results: [],
          error: error instanceof Error ? error.message : 'Search failed',
        };
      }
    },
  };
}

/**
 * Tool: get_document_summary
 * Roles: Editor, Admin
 * Returns summary of a specific document by slug.
 */
export function createGetDocumentSummaryTool(
  db: Database.Database,
): ToolDescriptor {
  return {
    name: 'get_document_summary',
    description:
      'Get a summary of a specific document by its slug. Returns title, chunk count, and content preview.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Document slug (URL-friendly identifier)',
        },
      },
      required: ['slug'],
    } as const,
    roles: ['Editor', 'Admin'],
    category: 'corpus',
    execute: async (input, ctx) => {
      const slug = String(input.slug ?? '');

      if (!slug.trim()) {
        return { error: 'Slug cannot be empty' };
      }

      try {
        // Get document — workspace-scoped lookup (Sprint 11).
        const doc = db
          .prepare(`
          SELECT id, slug, title, content
          FROM documents
          WHERE slug = ? AND workspace_id = ?
        `)
          .get(slug, ctx.workspaceId) as
          | { id: string; slug: string; title: string; content: string }
          | undefined;

        if (!doc) {
          return { error: `Document not found: ${slug}` };
        }

        // Get chunk count
        const chunkCount = db
          .prepare(`
          SELECT COUNT(*) as count
          FROM chunks
          WHERE document_id = ?
        `)
          .get(doc.id) as { count: number };

        // Return first 500 chars as preview
        const preview = doc.content.slice(0, 500);

        return {
          slug: doc.slug,
          title: doc.title,
          chunk_count: chunkCount.count,
          content_preview: preview,
          has_more: doc.content.length > 500,
        };
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to get document summary',
        };
      }
    },
  };
}

/**
 * Tool: list_documents
 * Roles: Admin only
 * Returns list of all documents.
 */
export function createListDocumentsTool(db: Database.Database): ToolDescriptor {
  return {
    name: 'list_documents',
    description:
      'List all documents in the corpus with their titles, slugs, and chunk counts.',
    inputSchema: {
      type: 'object',
      properties: {},
    } as const,
    roles: ['Admin'],
    category: 'corpus',
    execute: async (_input, ctx) => {
      try {
        const docs = db
          .prepare(`
          SELECT d.id, d.slug, d.title,
                 COUNT(c.id) as chunk_count
          FROM documents d
          LEFT JOIN chunks c ON c.document_id = d.id
          WHERE d.workspace_id = ?
          GROUP BY d.id
          ORDER BY d.title
        `)
          .all(ctx.workspaceId) as {
          id: string;
          slug: string;
          title: string;
          chunk_count: number;
        }[];

        return {
          document_count: docs.length,
          documents: docs.map((doc) => ({
            slug: doc.slug,
            title: doc.title,
            chunk_count: doc.chunk_count,
          })),
        };
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : 'Failed to list documents',
        };
      }
    },
  };
}
