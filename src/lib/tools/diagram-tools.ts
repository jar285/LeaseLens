// Diagram tool — pure validation + descriptor.
// Returns the validated Mermaid source for the client to render.
// No DB read, no LLM call. The `db` parameter is accepted for
// signature parity with the corpus tools but unused.

import type Database from 'better-sqlite3';
import type { ToolDescriptor } from './domain';

// Sprint 25.2 Path B — block-beta was briefly added as the recommended
// severity-heatmap primitive but its v11.14 lexer rejects the
// `:::class` shorthand the model defaults to, producing parse errors
// at render time. flowchart+subgraph is the stable path; block-beta
// is no longer accepted.
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
    description: [
      'Render a Mermaid diagram in the chat as plain SVG. Use when the user asks to visualize, map, or diagram lease-related structure: severity distribution, clause relationships, or the scan workflow.',
      '',
      'CHART-TYPE GUIDANCE (pick by data shape, not by user phrasing):',
      '- SEVERITY DISTRIBUTION / "heatmap of risk" / "show severity by clause": use `flowchart LR` with one `subgraph` per severity bucket containing the clause nodes. Apply colors via `classDef` and one or more `class A,B,C bucketname` statements. The grouping IS the heatmap signal — each colored cluster reads as a severity bucket. DO NOT emit a flat flowchart with all clauses under one parent — that produces a row of 10+ leaf nodes which is unreadable.',
      '- CLAUSE RELATIONSHIPS / dependencies: same shape (`flowchart LR` with `subgraph` per topic — e.g. subgraph "Deposit" / subgraph "Termination"). Left-right reads better than top-down in the narrow chat panel.',
      '- SCAN WORKFLOW / what-just-happened: use `mindmap` or a short `flowchart TD` (≤ 10 nodes).',
      '',
      'CONSTRAINTS for readability (failing these produces unreadable output):',
      '- Keep node labels SHORT — ≤ 4 words per label. Move detail to the right-pane red flags, not into the diagram.',
      '- Keep total node count ≤ 20. If the data has more, group via `subgraph` or pick a different chart type.',
      '- Never put 10+ leaf nodes under one parent in a single row.',
      '- Apply per-severity colors via `classDef` + one `class id1,id2,id3 bucketname` statement per bucket. The inline `:::class` shorthand also works for flowchart.',
      '',
      'EXAMPLE — severity heatmap for 15 clauses (10 high, 4 medium, 1 ok):',
      '```',
      'flowchart LR',
      '  subgraph high_bucket["HIGH (10)"]',
      '    direction TB',
      '    C0["Auto-renewal"]',
      '    C1["Late fee"]',
      '    C2["Deposit"]',
      '    C3["Repairs"]',
      '    C4["Entry"]',
      '    C5["Service"]',
      '    C6["Atty fees"]',
      '    C7["Indemnify"]',
      '    C8["Jury waiver"]',
      '    C9["Retaliation"]',
      '  end',
      '  subgraph med_bucket["MEDIUM (4)"]',
      '    direction TB',
      '    C10["Utilities"]',
      '    C11["Pets"]',
      '    C12["Insurance"]',
      '    C13["Term"]',
      '  end',
      '  subgraph ok_bucket["OK (1)"]',
      '    direction TB',
      '    C14["Severability"]',
      '  end',
      '  classDef high fill:#fca5a5,stroke:#dc2626,color:#7f1d1d',
      '  classDef med fill:#fcd34d,stroke:#ca8a04,color:#713f12',
      '  classDef ok fill:#86efac,stroke:#16a34a,color:#14532d',
      '  class C0,C1,C2,C3,C4,C5,C6,C7,C8,C9 high',
      '  class C10,C11,C12,C13 med',
      '  class C14 ok',
      '```',
      '',
      'The `code` field accepts raw Mermaid source — start with one of: flowchart, graph, sequenceDiagram, stateDiagram-v2, mindmap, journey, classDiagram, erDiagram. Mermaid `%%{init:...}%%` directives and `%%` line comments may precede the diagram keyword.',
    ].join('\n'),
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
