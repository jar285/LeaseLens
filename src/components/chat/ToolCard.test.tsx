import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeaseParserProvider } from '@/components/lease/LeaseParserContext';
import { useRollback } from '@/lib/audit/use-rollback';
import type { Role } from '@/lib/auth/types';
import type { ToolInvocation } from './ChatMessage';
import { ChatStreamProvider } from './ChatStreamContext';
import { ToolCard, verbosityForRole } from './ToolCard';

vi.mock('@/lib/audit/use-rollback', () => ({
  useRollback: vi.fn(() => ({
    status: 'idle',
    rollback: vi.fn(),
  })),
}));

// Stub MermaidDiagram so the ToolCard tests don't pull in the mermaid
// runtime — the diagram-render branch is asserted via this sentinel.
vi.mock('./MermaidDiagram', () => ({
  MermaidDiagram: vi.fn(({ code, title, caption }) => (
    <div
      data-testid="mermaid-stub"
      data-code={code}
      data-title={title ?? ''}
      data-caption={caption ?? ''}
    />
  )),
}));

const useReducedMotionMock = vi.fn();
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => useReducedMotionMock(),
  };
});

function renderToolCard(
  invocation: Partial<ToolInvocation> = {},
  viewerRole?: Role,
) {
  const baseInvocation: ToolInvocation = {
    id: 'tool-1',
    name: 'schedule_content_item',
    input: { document_slug: 'brand-identity' },
    ...invocation,
  };

  // Sprint 18 §3 — the grade_clause_severity branch reads pdfViewerRef
  // and setActiveClauseId from ChatStreamContext for the View-on-page
  // wiring. Wrap unconditionally so both legacy and new tests share a
  // single render shape; ToolCard ignores the context when the branch
  // doesn't fire. S19.8 — pass `viewerRole` when the test wants to
  // exercise the Reviewer/Admin verbosity branches.
  return render(
    <LeaseParserProvider>
      <ChatStreamProvider viewerRole={viewerRole}>
        <ToolCard invocation={baseInvocation} />
      </ChatStreamProvider>
    </LeaseParserProvider>,
  );
}

describe('ToolCard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(false);
  });

  it('renders running status and loading body for pending invocations', () => {
    renderToolCard();

    expect(screen.getByText('Running...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tool is running');
  });

  it('renders success state without the loading body', () => {
    renderToolCard({ result: { schedule_id: 'schedule-1' } });

    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.queryByText('Tool is running')).not.toBeInTheDocument();
  });

  it('renders error state without the loading body', () => {
    renderToolCard({ error: 'Tool failed', result: { error: 'Tool failed' } });

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.queryByText('Tool is running')).not.toBeInTheDocument();
  });

  it('renders Undo for mutating success with compensating action metadata', () => {
    renderToolCard({
      audit_id: 'audit-1',
      compensating_available: true,
      result: { schedule_id: 'schedule-1' },
    });

    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(useRollback).toHaveBeenCalledWith('audit-1');
  });

  it('shows Input and Result sections when completed calls are expanded', () => {
    renderToolCard({ result: { schedule_id: 'schedule-1' } });

    fireEvent.click(
      screen.getByRole('button', { name: 'Expand tool details' }),
    );

    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText('Result')).toBeInTheDocument();
    expect(screen.getByText(/schedule-1/)).toBeInTheDocument();
  });

  describe('Sprint 12 — render_workflow_diagram branch', () => {
    it('renders MermaidDiagram when name matches and result is present', () => {
      renderToolCard({
        name: 'render_workflow_diagram',
        input: { code: 'flowchart TD\nA-->B' },
        result: {
          code: 'flowchart TD\nA-->B',
          diagram_type: 'flowchart',
          title: 'Approval flow',
          caption: 'Draft to publish.',
        },
      });
      const stub = screen.getByTestId('mermaid-stub');
      expect(stub).toBeInTheDocument();
      expect(stub.getAttribute('data-code')).toBe('flowchart TD\nA-->B');
      expect(stub.getAttribute('data-title')).toBe('Approval flow');
      expect(stub.getAttribute('data-caption')).toBe('Draft to publish.');
    });

    it('does not render MermaidDiagram while invocation is pending', () => {
      renderToolCard({
        name: 'render_workflow_diagram',
        input: { code: 'flowchart TD\nA-->B' },
      });
      expect(screen.queryByTestId('mermaid-stub')).not.toBeInTheDocument();
    });

    it('does not render MermaidDiagram on error', () => {
      renderToolCard({
        name: 'render_workflow_diagram',
        input: { code: 'foobar' },
        error: 'Diagram code must start with one of: flowchart, ...',
        result: { error: 'Diagram code must start with one of: flowchart' },
      });
      expect(screen.queryByTestId('mermaid-stub')).not.toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  describe('Sprint 12 — expand/collapse motion wrapper', () => {
    it('expanded body wrapper has data-motion="on" when reduced-motion is off', () => {
      useReducedMotionMock.mockReturnValue(false);
      const { container } = renderToolCard({
        result: { schedule_id: 'schedule-1' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand tool details' }),
      );
      const wrapper = container.querySelector('[data-testid="expanded-body"]');
      expect(wrapper?.getAttribute('data-motion')).toBe('on');
    });

    it('expanded body wrapper has data-motion="off" when reduced-motion is on', () => {
      useReducedMotionMock.mockReturnValue(true);
      const { container } = renderToolCard({
        result: { schedule_id: 'schedule-1' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand tool details' }),
      );
      const wrapper = container.querySelector('[data-testid="expanded-body"]');
      expect(wrapper?.getAttribute('data-motion')).toBe('off');
    });
  });

  // Sprint 18 §3 — tenant-friendly grade_clause_severity body.
  describe('grade_clause_severity tenant-friendly branch', () => {
    const goodGrading = {
      clause_id: 'c1',
      severity: 'high',
      statute_citation: 'NJ Stat 46:8-19',
      chunk_id: 'security-deposit-cap#section:1',
      reasoning: 'Two months exceeds the NJ 1.5-month cap.',
      recommended_action: 'Cap deposit at 1.5 months rent.',
      clause_type: 'security_deposit',
      clause_index: 2,
      page_number: 4,
    };

    it('renders the polished GradingDetailBlock in the expanded body for a valid grading', () => {
      renderToolCard({
        name: 'grade_clause_severity',
        input: { clause_id: 'c1' },
        result: goodGrading,
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand tool details' }),
      );
      const block = screen.getByTestId('grading-detail-block');
      expect(block).toBeInTheDocument();
      expect(block.getAttribute('data-severity')).toBe('high');
      expect(screen.getByText(/Security deposit · §3/)).toBeInTheDocument();
      expect(screen.getByText(/NJ Stat 46:8-19/)).toBeInTheDocument();
      expect(screen.getByText(/Recommended action/i)).toBeInTheDocument();
      expect(screen.getByText(/View on page 4/)).toBeInTheDocument();
      // JSON fallback is suppressed when the polished body renders.
      expect(screen.queryByText('Input')).not.toBeInTheDocument();
      expect(screen.queryByText('Result')).not.toBeInTheDocument();
    });

    it('falls back to JSON view for a non-grading tool', () => {
      renderToolCard({
        name: 'search_corpus',
        input: { query: 'security deposit' },
        result: { hits: [] },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand tool details' }),
      );
      expect(
        screen.queryByTestId('grading-detail-block'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Input')).toBeInTheDocument();
      expect(screen.getByText('Result')).toBeInTheDocument();
    });

    it('falls back to JSON view when grade_clause_severity errored (result is an error envelope)', () => {
      renderToolCard({
        name: 'grade_clause_severity',
        input: { clause_id: 'c1' },
        error: 'corpus lookup failed',
        result: { error: 'corpus lookup failed' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand tool details' }),
      );
      expect(
        screen.queryByTestId('grading-detail-block'),
      ).not.toBeInTheDocument();
      // JSON view still surfaces the error payload for debugging.
      expect(screen.getByText('Result')).toBeInTheDocument();
    });

    it('falls back to JSON view when grade_clause_severity returned malformed shape', () => {
      renderToolCard({
        name: 'grade_clause_severity',
        input: { clause_id: 'c1' },
        // Missing severity field — the typeguard rejects it.
        result: { clause_id: 'c1', statute_citation: 'foo' },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand tool details' }),
      );
      expect(
        screen.queryByTestId('grading-detail-block'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Result')).toBeInTheDocument();
    });

    // S19.8 — Reviewer / Admin propagate through verbosityForRole into
    // GradingDetailBlock. Tenant suppresses the corpus-source line and
    // raw JSON; Reviewer shows the source; Admin shows source + raw.
    it('Tenant viewer renders the GradingDetailBlock WITHOUT the source line or raw JSON', () => {
      renderToolCard(
        {
          name: 'grade_clause_severity',
          input: { clause_id: 'c1' },
          result: goodGrading,
        },
        'Tenant',
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand tool details' }),
      );
      expect(screen.getByTestId('grading-detail-block')).toBeInTheDocument();
      expect(
        screen.queryByTestId('grading-detail-source'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('grading-detail-raw-json'),
      ).not.toBeInTheDocument();
    });

    it('Reviewer viewer surfaces the corpus-source line but not raw JSON', () => {
      renderToolCard(
        {
          name: 'grade_clause_severity',
          input: { clause_id: 'c1' },
          result: goodGrading,
        },
        'Reviewer',
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand tool details' }),
      );
      expect(screen.getByTestId('grading-detail-source')).toBeInTheDocument();
      expect(
        screen.queryByTestId('grading-detail-raw-json'),
      ).not.toBeInTheDocument();
    });

    it('Admin viewer surfaces both the corpus-source line and the raw-JSON disclosure', () => {
      renderToolCard(
        {
          name: 'grade_clause_severity',
          input: { clause_id: 'c1' },
          result: goodGrading,
        },
        'Admin',
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Expand tool details' }),
      );
      expect(screen.getByTestId('grading-detail-source')).toBeInTheDocument();
      expect(screen.getByTestId('grading-detail-raw-json')).toBeInTheDocument();
    });
  });

  describe('verbosityForRole', () => {
    it('maps Tenant → tenant, Reviewer → reviewer, Admin → admin', () => {
      expect(verbosityForRole('Tenant')).toBe('tenant');
      expect(verbosityForRole('Reviewer')).toBe('reviewer');
      expect(verbosityForRole('Admin')).toBe('admin');
    });
  });
});
