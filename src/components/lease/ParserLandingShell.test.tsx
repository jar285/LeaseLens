// Sprint 26a Phase 3 — red test (updated in Sprint 26c).
//
// Mode-A composition root. Wraps the hero dropzone, a 5-stage flow strip,
// the trust-metric strip, the disclaimer, and the FAB. Wraps its subtree
// in AssistantFabProvider + ChatStreamProvider so both contexts are
// available to descendants.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLeaseParser } from './LeaseParserContext';
import { ParserLandingShell } from './ParserLandingShell';

// Sprint 26c — the real FAB is dynamically imported; mock it to a
// marker so this composition test stays focused on the shell layout.
vi.mock('@/components/chat/AssistantFab', () => ({
  AssistantFab: () => (
    <button
      type="button"
      data-testid="assistant-fab"
      aria-label="Open assistant"
    >
      Open assistant
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ParserLandingShell', () => {
  it('renders the hero dropzone with editorial headline', () => {
    render(<ParserLandingShell workspaceName="Demo workspace" />);
    expect(screen.getByTestId('parser-landing-shell')).toBeInTheDocument();
    expect(screen.getByTestId('lease-hero-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('lease-hero-headline')).toBeInTheDocument();
  });

  it('renders the LeaseLensMark brand badge above the headline (Sprint 26c.1)', () => {
    render(<ParserLandingShell workspaceName="Demo workspace" />);
    const badge = screen.getByTestId('parser-landing-badge');
    expect(badge).toBeInTheDocument();
    // The badge wraps the bespoke LeaseLensMark SVG; verify a child <svg>
    // is rendered (the mark exports an inline SVG).
    expect(badge.querySelector('svg')).not.toBeNull();
  });

  it('renders the "LeaseLens" wordmark below the brand badge with serif-italic emphasis (Sprint 26c.1/.5)', () => {
    render(<ParserLandingShell workspaceName="Demo workspace" />);
    const wordmark = screen.getByTestId('parser-landing-wordmark');
    expect(wordmark).toBeInTheDocument();
    expect(wordmark.textContent).toBe('LeaseLens');
    // Mirrors the "negotiate" emphasis in the hero headline: serif italic.
    expect(wordmark.className).toMatch(/\bitalic\b/);
    expect(wordmark.className).toMatch(/\bfont-serif\b/);
  });

  it('renders the 5-stage flow strip in order', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    const flow = screen.getByTestId('parser-flow-strip');
    expect(flow).toBeInTheDocument();
    const text = flow.textContent ?? '';
    // Stage order: Upload → Parse → Extract clauses → Flag risks → Review.
    const stages = [
      'Upload',
      'Parse',
      'Extract clauses',
      'Flag risks',
      'Review',
    ];
    let lastIdx = -1;
    for (const stage of stages) {
      const idx = text.indexOf(stage);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('renders the trust-metric strip with three proof points', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    const strip = screen.getByTestId('parser-trust-metrics');
    expect(strip).toBeInTheDocument();
    expect(strip.textContent).toMatch(/clauses checked/i);
    expect(strip.textContent).toMatch(/njsa/i);
    expect(strip.textContent).toMatch(/plain-english/i);
  });

  it('renders the legal disclaimer', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    expect(screen.getByTestId('parser-landing-disclaimer')).toBeInTheDocument();
  });

  it('mounts the real AssistantFab (Sprint 26c)', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    expect(screen.getByTestId('assistant-fab')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-fab-stub')).not.toBeInTheDocument();
  });

  it('does NOT render the chat composer or the chat empty state', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    expect(screen.queryByTestId('chat-composer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chat-empty-state')).not.toBeInTheDocument();
  });

  it('wraps its subtree in a LeaseParserProvider so descendants can use useLeaseParser()', () => {
    // A probe component that consumes the context. If the provider is
    // missing, useLeaseParser throws synchronously and render() fails.
    function Probe(): React.JSX.Element {
      const { activeLease } = useLeaseParser();
      return (
        <span data-testid="ctx-probe">
          {activeLease ? 'has-lease' : 'no-lease'}
        </span>
      );
    }
    render(
      <ParserLandingShell workspaceName="Demo">
        <Probe />
      </ParserLandingShell>,
    );
    expect(screen.getByTestId('ctx-probe')).toHaveTextContent('no-lease');
  });
});
