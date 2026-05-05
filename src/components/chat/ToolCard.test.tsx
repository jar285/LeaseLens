import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRollback } from '@/lib/audit/use-rollback';
import type { ToolInvocation } from './ChatMessage';
import { ToolCard } from './ToolCard';

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

function renderToolCard(invocation: Partial<ToolInvocation> = {}) {
  const baseInvocation: ToolInvocation = {
    id: 'tool-1',
    name: 'schedule_content_item',
    input: { document_slug: 'brand-identity' },
    ...invocation,
  };

  return render(<ToolCard invocation={baseInvocation} />);
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
      const wrapper = container.querySelector(
        '[data-testid="expanded-body"]',
      );
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
      const wrapper = container.querySelector(
        '[data-testid="expanded-body"]',
      );
      expect(wrapper?.getAttribute('data-motion')).toBe('off');
    });
  });
});
