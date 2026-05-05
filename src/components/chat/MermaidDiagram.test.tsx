import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: renderMock,
  },
}));

const useReducedMotionMock = vi.fn();
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return {
    ...actual,
    useReducedMotion: () => useReducedMotionMock(),
  };
});

import { MermaidDiagram } from './MermaidDiagram';

describe('MermaidDiagram', () => {
  beforeEach(() => {
    renderMock.mockReset();
    useReducedMotionMock.mockReset();
    useReducedMotionMock.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the rendered SVG when mermaid resolves', async () => {
    renderMock.mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg"><g/></svg>',
      diagramType: 'flowchart',
    });
    render(<MermaidDiagram code="flowchart TD\nA-->B" />);
    await waitFor(() => {
      expect(screen.getByTestId('mermaid-svg')).toBeInTheDocument();
    });
  });

  it('falls back to a code block on render rejection', async () => {
    renderMock.mockRejectedValue(new Error('parse error: bad token'));
    render(<MermaidDiagram code="flowchart TD\nbroken" />);
    await waitFor(() => {
      expect(screen.getByText(/parse error: bad token/)).toBeInTheDocument();
    });
    expect(screen.getByText(/flowchart TD/)).toBeInTheDocument();
  });

  it('renders title when provided', async () => {
    renderMock.mockResolvedValue({ svg: '<svg/>', diagramType: 'flowchart' });
    render(<MermaidDiagram code="flowchart TD\nA-->B" title="My Diagram" />);
    expect(screen.getByText('My Diagram')).toBeInTheDocument();
  });

  it('renders caption when provided', async () => {
    renderMock.mockResolvedValue({ svg: '<svg/>', diagramType: 'flowchart' });
    render(
      <MermaidDiagram code="flowchart TD\nA-->B" caption="A short caption." />,
    );
    expect(screen.getByText('A short caption.')).toBeInTheDocument();
  });

  it('wraps in motion.div with data-motion="on" once mounted (reduced-motion off)', async () => {
    useReducedMotionMock.mockReturnValue(false);
    renderMock.mockResolvedValue({ svg: '<svg/>', diagramType: 'flowchart' });
    const { container } = render(<MermaidDiagram code="flowchart TD\nA-->B" />);
    await waitFor(() => {
      const wrapper = container.querySelector('[data-motion]');
      expect(wrapper?.getAttribute('data-motion')).toBe('on');
    });
  });

  it('wraps in plain div with data-motion="off" when reduced-motion is on', async () => {
    useReducedMotionMock.mockReturnValue(true);
    renderMock.mockResolvedValue({ svg: '<svg/>', diagramType: 'flowchart' });
    const { container } = render(<MermaidDiagram code="flowchart TD\nA-->B" />);
    // After mount + render, the wrapper is the plain div regardless of frame.
    await waitFor(() => {
      const wrapper = container.querySelector('[data-motion]');
      expect(wrapper?.getAttribute('data-motion')).toBe('off');
    });
  });
});
