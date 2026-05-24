import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const renderMock = vi.fn();
const initializeMock = vi.fn();
vi.mock('mermaid', () => ({
  default: {
    initialize: initializeMock,
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
    // Don't reset initializeMock — loadMermaid() caches the promise at
    // module scope, so initialize fires once across the whole file.
    // We assert on it in a dedicated describe block below.
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

  // Sprint 25.2 — click-to-expand. The inline mermaid render is often
  // unreadable (especially for severity heatmaps with 15+ clauses).
  // Clicking the diagram opens a fullscreen modal; Escape / backdrop
  // click / the X button all close it.
  describe('click-to-expand modal', () => {
    it('opens a modal when the rendered diagram is clicked', async () => {
      renderMock.mockResolvedValue({
        svg: '<svg data-testid="mermaid-svg"><g/></svg>',
        diagramType: 'flowchart',
      });
      render(<MermaidDiagram code="flowchart TD\nA-->B" title="My Map" />);

      const expandButton = await screen.findByRole('button', {
        name: 'Expand diagram',
      });

      expect(
        screen.queryByTestId('mermaid-diagram-modal'),
      ).not.toBeInTheDocument();

      fireEvent.click(expandButton);

      const modal = await screen.findByTestId('mermaid-diagram-modal');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute('aria-modal', 'true');
      expect(modal).toHaveAttribute('aria-label', 'My Map');
    });

    it('closes the modal when Escape is pressed', async () => {
      renderMock.mockResolvedValue({
        svg: '<svg/>',
        diagramType: 'flowchart',
      });
      render(<MermaidDiagram code="flowchart TD\nA-->B" />);
      fireEvent.click(
        await screen.findByRole('button', { name: 'Expand diagram' }),
      );
      await screen.findByTestId('mermaid-diagram-modal');

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(
          screen.queryByTestId('mermaid-diagram-modal'),
        ).not.toBeInTheDocument();
      });
    });

    it('closes the modal when the X button is clicked', async () => {
      renderMock.mockResolvedValue({
        svg: '<svg/>',
        diagramType: 'flowchart',
      });
      render(<MermaidDiagram code="flowchart TD\nA-->B" />);
      fireEvent.click(
        await screen.findByRole('button', { name: 'Expand diagram' }),
      );
      await screen.findByTestId('mermaid-diagram-modal');

      fireEvent.click(screen.getByRole('button', { name: 'Close diagram' }));

      await waitFor(() => {
        expect(
          screen.queryByTestId('mermaid-diagram-modal'),
        ).not.toBeInTheDocument();
      });
    });

    it('closes the modal when the backdrop is clicked but NOT when the SVG container is', async () => {
      renderMock.mockResolvedValue({
        svg: '<svg data-testid="mermaid-svg"><g/></svg>',
        diagramType: 'flowchart',
      });
      render(<MermaidDiagram code="flowchart TD\nA-->B" />);
      fireEvent.click(
        await screen.findByRole('button', { name: 'Expand diagram' }),
      );
      const modal = await screen.findByTestId('mermaid-diagram-modal');

      // Click the inner SVG — should NOT close (click is stopped at the
      // SVG container).
      fireEvent.click(screen.getAllByTestId('mermaid-svg')[1]);
      expect(modal).toBeInTheDocument();

      // Click the backdrop — DOES close.
      fireEvent.click(modal);
      await waitFor(() => {
        expect(
          screen.queryByTestId('mermaid-diagram-modal'),
        ).not.toBeInTheDocument();
      });
    });

    it('does not render an expand affordance while the diagram is still loading', () => {
      // Mermaid render hasn't resolved yet — no SVG, no Expand button.
      renderMock.mockReturnValue(new Promise(() => {}));
      render(<MermaidDiagram code="flowchart TD\nA-->B" />);
      expect(
        screen.queryByRole('button', { name: 'Expand diagram' }),
      ).not.toBeInTheDocument();
    });
  });

  // Sprint 25.2 — Phase 1 of the readable-diagrams polish. The default
  // Mermaid theme renders labels in a 12px sans that's hard to read
  // inside a chat bubble. Configuring themeVariables.fontSize +
  // fontFamily at initialize time means every diagram in the chat
  // inherits the readable baseline without per-call init directives.
  describe('mermaid.initialize theming (Sprint 25.2)', () => {
    it('passes themeVariables with a readable fontSize + fontFamily to mermaid.initialize', async () => {
      renderMock.mockResolvedValue({
        svg: '<svg/>',
        diagramType: 'flowchart',
      });
      render(<MermaidDiagram code="flowchart TD\nA-->B" />);
      // loadMermaid is async; wait for the render() to fire which
      // proves initialize ran first.
      await waitFor(() => {
        expect(renderMock).toHaveBeenCalled();
      });
      // Of all initialize() calls (loadMermaid is cached across tests
      // in this file), the first one — the only one that fires the
      // module-scope singleton — must carry themeVariables.
      expect(initializeMock).toHaveBeenCalled();
      const firstCall = initializeMock.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      expect(firstCall).toEqual(
        expect.objectContaining({
          themeVariables: expect.objectContaining({
            fontSize: expect.stringMatching(/\d+px$/),
            fontFamily: expect.any(String),
          }),
        }),
      );
    });
  });
});
