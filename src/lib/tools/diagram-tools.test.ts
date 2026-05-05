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
  role: 'Creator',
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

  it('rejects oversized input', async () => {
    const tool = createRenderWorkflowDiagramTool(stubDb);
    const oversized = 'flowchart TD\n' + 'A-->B\n'.repeat(800); // > 4000 chars
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
});
