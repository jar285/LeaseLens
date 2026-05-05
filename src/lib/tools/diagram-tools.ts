// Diagram tool — pure validation + descriptor.
// Returns the validated Mermaid source for the client to render.
// No DB read, no LLM call. The `db` parameter is accepted for
// signature parity with the corpus tools but unused.

import type Database from 'better-sqlite3';
import type { ToolDescriptor } from './domain';

const DIAGRAM_PREFIXES = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'stateDiagram-v2',
  'mindmap',
  'journey',
  'classDiagram',
  'erDiagram',
] as const;

type DiagramType = (typeof DIAGRAM_PREFIXES)[number];

const DIAGRAM_PREFIX_REGEX =
  /^(flowchart|graph|sequenceDiagram|stateDiagram-v2|mindmap|journey|classDiagram|erDiagram)\b/;

const INIT_DIRECTIVE_REGEX = /^%%\{[\s\S]*?\}%%\s*$/;
const LINE_COMMENT_REGEX = /^%%[^\n]*$/;

const MAX_CODE_LENGTH = 4000;

function stripLeadingNoise(code: string): string {
  let working = code.replace(/^\s+/, '');
  while (working.length > 0) {
    const newlineIdx = working.indexOf('\n');
    const firstLine =
      newlineIdx === -1 ? working : working.slice(0, newlineIdx);
    const trimmed = firstLine.trim();
    if (
      INIT_DIRECTIVE_REGEX.test(trimmed) ||
      LINE_COMMENT_REGEX.test(trimmed)
    ) {
      working =
        newlineIdx === -1
          ? ''
          : working.slice(newlineIdx + 1).replace(/^\s+/, '');
      continue;
    }
    break;
  }
  return working;
}

export function createRenderWorkflowDiagramTool(
  _db: Database.Database,
): ToolDescriptor {
  return {
    name: 'render_workflow_diagram',
    description:
      'Render a Mermaid diagram in the chat. Use when the user asks to draw, visualize, map, or diagram a workflow, taxonomy, state machine, or relationship. Common topics: approval pipeline, content calendar layout, brand voice taxonomy, publishing state machine. The `code` field accepts raw Mermaid source — start with one of: flowchart, graph, sequenceDiagram, stateDiagram-v2, mindmap, journey, classDiagram, erDiagram. Mermaid `%%{init:...}%%` directives and `%%` line comments may precede the diagram keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: `Mermaid diagram source code. Maximum ${MAX_CODE_LENGTH} characters. Labels render as plain SVG text (HTML formatting in labels is not honored).`,
          maxLength: MAX_CODE_LENGTH,
        },
        title: {
          type: 'string',
          description:
            'Short title shown in the diagram card header. Optional.',
          maxLength: 120,
        },
        caption: {
          type: 'string',
          description:
            'One-sentence caption shown below the diagram. Optional.',
          maxLength: 280,
        },
      },
      required: ['code'],
    } as const,
    roles: 'ALL',
    category: 'visualization',
    execute: async (input, _ctx) => {
      const code = String(input.code ?? '');
      if (code.length > MAX_CODE_LENGTH) {
        throw new Error(
          `Diagram code exceeds maximum of ${MAX_CODE_LENGTH} characters.`,
        );
      }
      const stripped = stripLeadingNoise(code);
      const match = stripped.match(DIAGRAM_PREFIX_REGEX);
      if (!match) {
        throw new Error(
          `Diagram code must start with one of: ${DIAGRAM_PREFIXES.join(', ')}.`,
        );
      }
      const result: {
        code: string;
        diagram_type: DiagramType;
        title?: string;
        caption?: string;
      } = {
        code,
        diagram_type: match[1] as DiagramType,
      };
      if (typeof input.title === 'string') result.title = input.title;
      if (typeof input.caption === 'string') result.caption = input.caption;
      return result;
    },
  };
}
