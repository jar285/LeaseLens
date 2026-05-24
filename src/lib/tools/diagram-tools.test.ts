// Unit tests for the render_workflow_diagram tool — pure validation.
// No DB, no LLM call. The factory accepts a Database parameter for
// signature parity with createSearchCorpusTool but does not use it.

import type Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import { createRenderWorkflowDiagramTool } from './diagram-tools';
import type { ToolExecutionContext } from './domain';

const stubDb = null as unknown as Database.Database;

const ctx: ToolExecutionContext = {
  role: 'Tenant',
  userId: 'test-user',
  conversationId: 'test-conv',
  workspaceId: SAMPLE_WORKSPACE.id,
};

describe('render_workflow_diagram tool', () => {
  it('descriptor exposes the expected shape', () => {
    const tool = createRenderWorkflowDiagramTool(stubDb);
    expect(tool.name).toBe('render_workflow_diagram');
    expect(tool.category).toBe('visualization');
    expect(tool.roles).toBe('ALL');
    expect(tool.compensatingAction).toBeUndefined();
    expect(typeof tool.execute).toBe('function');
  });

  it('accepts a valid flowchart and echoes the input', async () => {
    const tool = createRenderWorkflowDiagramTool(stubDb);
    const result = (await tool.execute(
      { code: 'flowchart TD\nA-->B' },
      ctx,
    )) as { code: string; diagram_type: string };
    expect(result.code).toBe('flowchart TD\nA-->B');
    expect(result.diagram_type).toBe('flowchart');
  });

  it.each([
    ['flowchart', 'flowchart TD\nA-->B'],
    ['graph', 'graph LR\nA-->B'],
    ['sequenceDiagram', 'sequenceDiagram\nA->>B: hi'],
    ['stateDiagram-v2', 'stateDiagram-v2\n[*] --> Idle'],
    ['mindmap', 'mindmap\nroot\n  child'],
    ['journey', 'journey\ntitle X\nsection Y\n  Step: 5: Me'],
    ['classDiagram', 'classDiagram\nclass Foo'],
    ['erDiagram', 'erDiagram\nA ||--o{ B : has'],
  ])('accepts diagram type %s', async (expected, code) => {
    const tool = createRenderWorkflowDiagramTool(stubDb);
    const result = (await tool.execute({ code }, ctx)) as {
      diagram_type: string;
    };
    expect(result.diagram_type).toBe(expected);
  });

  it('strips Mermaid init directives before checking prefix', async () => {
    const tool = createRenderWorkflowDiagramTool(stubDb);
    const result = (await tool.execute(
      {
        code: '%%{init: {"theme":"neutral"}}%%\nflowchart TD\nA-->B',
      },
      ctx,
    )) as { diagram_type: string };
    expect(result.diagram_type).toBe('flowchart');
  });

  it('strips Mermaid line comments before checking prefix', async () => {
    const tool = createRenderWorkflowDiagramTool(stubDb);
    const result = (await tool.execute(
      {
        code: '%% one comment\n%% another comment\nflowchart TD\nA-->B',
      },
      ctx,
    )) as { diagram_type: string };
    expect(result.diagram_type).toBe('flowchart');
  });

  it('rejects unknown prefix with a helpful message', async () => {
    const tool = createRenderWorkflowDiagramTool(stubDb);
    await expect(
      tool.execute({ code: 'foobar TD\nA-->B' }, ctx),
    ).rejects.toThrow(/flowchart.*graph.*sequenceDiagram/);
  });

  // Sprint 25.2 Path B — block-beta is not supported at the renderer
  // level for our use case (Mermaid v11.14 rejects the `:::class`
  // shorthand the model defaulted to). Fail-fast at the validator
  // with the list of accepted types so the model gets a clean
  // correction signal instead of the renderer's lexical error.
  it('rejects block-beta with a helpful list of accepted types', async () => {
    const tool = createRenderWorkflowDiagramTool(stubDb);
    await expect(
      tool.execute({ code: 'block-beta\n  columns 3\n  A B C' }, ctx),
    ).rejects.toThrow(/flowchart/);
  });

  it('rejects oversized input', async () => {
    const tool = createRenderWorkflowDiagramTool(stubDb);
    const oversized = `flowchart TD\n${'A-->B\n'.repeat(800)}`; // > 4000 chars
    await expect(tool.execute({ code: oversized }, ctx)).rejects.toThrow(
      /4000/,
    );
  });

  it('echoes optional title and caption when provided', async () => {
    const tool = createRenderWorkflowDiagramTool(stubDb);
    const result = (await tool.execute(
      {
        code: 'flowchart TD\nA-->B',
        title: 'Approval Flow',
        caption: 'Draft to publish.',
      },
      ctx,
    )) as { code: string; title?: string; caption?: string };
    expect(result.title).toBe('Approval Flow');
    expect(result.caption).toBe('Draft to publish.');
  });

  // Sprint 25.2 — Phase 1 of the readable-diagrams polish. The tool's
  // description is what the model reads when choosing a chart type, so
  // tightening it is the single highest-leverage change for diagram
  // quality. The pre-Sprint-25 description carried ContentOps relics
  // ("approval pipeline, content calendar") and gave the model 8 chart
  // types with no per-intent recommendation, which produced flat
  // flowcharts with 15 leaf nodes when asked for severity heatmaps.
  describe('Sprint 25.2 — chart-type decision guidance in description', () => {
    it('drops the ContentOps-era examples', () => {
      const tool = createRenderWorkflowDiagramTool(stubDb);
      expect(tool.description).not.toContain('approval pipeline');
      expect(tool.description).not.toContain('content calendar');
      expect(tool.description).not.toContain('brand voice taxonomy');
      expect(tool.description).not.toContain('publishing state machine');
    });

    it('frames the tool around LeaseLens use cases (clauses, severity, scan flow)', () => {
      const tool = createRenderWorkflowDiagramTool(stubDb);
      expect(tool.description).toMatch(/clause|severity|lease/i);
    });

    it('recommends flowchart with subgraphs for severity-distribution intent', () => {
      const tool = createRenderWorkflowDiagramTool(stubDb);
      // Path B (Sprint 25.2 retry): block-beta turned out to reject the
      // `:::class` shorthand the model defaulted to in Mermaid v11.14,
      // producing lexical errors. Switching to `flowchart LR` with one
      // `subgraph` per severity bucket — a syntax stable since v10 —
      // is the reliable path for "show me severity distribution."
      expect(tool.description).toMatch(/flowchart/i);
      expect(tool.description).toMatch(/subgraph/i);
      expect(tool.description).toMatch(/severity/i);
    });

    it('does NOT recommend block-beta (incompatible with Mermaid v11.14 lexer)', () => {
      const tool = createRenderWorkflowDiagramTool(stubDb);
      // Explicit negative: block-beta is the dead-end we just exited.
      // Re-adding it to the recommendation set would regress the bug.
      expect(tool.description).not.toMatch(/block[- ]beta/i);
    });

    it('caps label verbosity and node count to keep diagrams readable', () => {
      const tool = createRenderWorkflowDiagramTool(stubDb);
      // The current bug is verbose node labels (e.g.
      // "Clause 5: Landlord Entry (no-notice entry rights)") clustered
      // in a flat row. The description must instruct the model to keep
      // labels short and the node count manageable.
      expect(tool.description).toMatch(/short|brief|≤|<=|under \d+ word/i);
      expect(tool.description).toMatch(/20 node|≤ 20|max 20|<= 20|fewer than 20/i);
    });
  });
});
