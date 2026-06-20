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
  it('renders a decorative ambient hero blob behind the lockup (Sprint 29.x)', () => {
    render(<ParserLandingShell workspaceName="Demo workspace" />);
    const blob = screen.getByTestId('parser-landing-hero-blob');
    expect(blob).toBeInTheDocument();
    expect(blob).toHaveAttribute('aria-hidden', 'true');
    expect(blob).toHaveAttribute('data-theme-layer', 'ambient');
  });

  it('uses theme-aware ambient blob layers (Sprint 29.x)', () => {
    render(<ParserLandingShell workspaceName="Demo workspace" />);
    expect(
      screen.getByTestId('parser-landing-hero-blob-gradient'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('parser-landing-hero-blob-fade'),
    ).toBeInTheDocument();
  });

  it('isolates stacking so the blob paints above the section background (Sprint 29.x)', () => {
    render(<ParserLandingShell workspaceName="Demo workspace" />);
    expect(screen.getByTestId('parser-landing-shell').className).toMatch(
      /\bisolate\b/,
    );
  });

  it('renders the hero dropzone with editorial headline', () => {
    render(<ParserLandingShell workspaceName="Demo workspace" />);
    expect(screen.getByTestId('parser-landing-shell')).toBeInTheDocument();
    expect(screen.getByTestId('lease-hero-dropzone')).toBeInTheDocument();
    expect(screen.getByTestId('lease-hero-headline')).toBeInTheDocument();
  });

  it('wraps the brand lockup and dropzone in a hero entrance container (Sprint 29.x)', () => {
    render(<ParserLandingShell workspaceName="Demo workspace" />);
    const entrance = screen.getByTestId('parser-landing-hero-entrance');
    expect(entrance).toBeInTheDocument();
    expect(['static', 'animated']).toContain(
      entrance.getAttribute('data-motion'),
    );
  });

  it('renders the LeaseLensMark brand badge above the headline (Sprint 26c.1)', () => {
    render(<ParserLandingShell workspaceName="Demo workspace" />);
    const badge = screen.getByTestId('parser-landing-badge');
    expect(badge).toBeInTheDocument();
    // The badge wraps the bespoke LeaseLensMark SVG; verify a child <svg>
    // is rendered (the mark exports an inline SVG).
    expect(badge.querySelector('svg')).not.toBeNull();
    // Sprint 49 — premium lift in the hero's own (pale) register: a subtle
    // within-family gradient + soft shadow, NOT the masthead's solid tile.
    expect(badge.className).toMatch(/\bbg-gradient-to-br\b/);
    expect(badge.className).toMatch(/from-accent-50\b/);
    expect(badge.className).toMatch(/\bshadow-\[/);
  });

  it('does not duplicate the LeaseLens wordmark in the hero (Sprint 29.x)', () => {
    render(<ParserLandingShell workspaceName="Demo workspace" />);
    expect(
      screen.queryByTestId('parser-landing-wordmark'),
    ).not.toBeInTheDocument();
  });

  it('renders a support band with numbered workflow steps (Sprint 29.x)', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    expect(screen.getByTestId('parser-landing-support')).toBeInTheDocument();
    expect(
      screen.getByTestId('parser-landing-support-label'),
    ).toHaveTextContent(/how it works/i);
    const flow = screen.getByTestId('parser-flow-strip');
    expect(flow.textContent).toMatch(/01/);
    expect(flow.textContent).toMatch(/05/);
  });

  it('renders trust metrics as circular badges (Sprint 29.x)', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    expect(screen.getAllByTestId('parser-trust-metric')).toHaveLength(3);
  });

  it('applies subtle hover scale on trust metric circles (Sprint 29.x)', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    const circles = screen.getAllByTestId('parser-trust-metric-circle');
    expect(circles).toHaveLength(3);
    for (const circle of circles) {
      expect(circle.className).toMatch(/hover:scale-105/);
      expect(circle.className).toMatch(/motion-safe:/);
      expect(circle.className).toMatch(/motion-reduce:hover:scale-100/);
    }
  });

  it('renders trust metric circles as frosted glass (Sprint 41)', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    const circles = screen.getAllByTestId('parser-trust-metric-circle');
    expect(circles).toHaveLength(3);
    for (const circle of circles) {
      // Reuses the FAB glass recipe: translucent parchment + backdrop blur,
      // with a backdrop-filter-aware opacity step-down.
      expect(circle.className).toMatch(/backdrop-blur/);
      expect(circle.className).toMatch(/supports-\[backdrop-filter\]/);
      expect(circle.className).toMatch(/bg-surface-card\//);
      // Sprint 41 — Tailwind v4: the hover scale animates the `scale`
      // property, NOT `transform`. The transition must name `scale` or the
      // lift snaps instantly (the old `transition-transform` bug).
      expect(circle.className).toMatch(/transition-\[scale/);
      expect(circle.className).not.toMatch(/transition-transform/);
    }
  });

  it('renders the site footer as a sibling of the hero section (Sprint 41)', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    const footer = screen.getByTestId('site-footer');
    expect(footer).toBeInTheDocument();
    // The footer must sit outside the hero section, not inside the
    // scrollable hero content.
    const shell = screen.getByTestId('parser-landing-shell');
    expect(shell.contains(footer)).toBe(false);
  });

  it('renders an Open Design–style editorial frame on the landing shell (Sprint 29.x)', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    const frame = screen.getByTestId('parser-landing-editorial-frame');
    expect(frame).toBeInTheDocument();
    expect(frame.className).toMatch(/\babsolute\b/);
    expect(
      screen.getByTestId('parser-landing-editorial-frame-viewport'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('parser-landing-frame-top')).toBeInTheDocument();
    expect(
      screen.getByTestId('parser-landing-frame-corner-tl'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('parser-landing-frame-corner-tr'),
    ).toBeInTheDocument();
  });

  it('renders the workspace eyebrow once on the editorial hairline (Sprint 29.x)', () => {
    const label = 'LeaseLens — NJ Tenant Law';
    render(<ParserLandingShell workspaceName={label} />);
    const eyebrows = screen.getAllByTestId('parser-landing-eyebrow');
    expect(eyebrows).toHaveLength(1);
    expect(eyebrows[0]).toHaveTextContent(label);
    expect(
      eyebrows[0].closest('[data-testid="parser-landing-frame-top"]'),
    ).not.toBeNull();
  });

  it('does not trap landing scroll in the section (Sprint 29.x sticky rails)', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    const shell = screen.getByTestId('parser-landing-shell');
    expect(shell.className).not.toMatch(/\boverflow-y-auto\b/);
    expect(shell.className).not.toMatch(/\boverflow-hidden\b/);
  });

  // Sprint 29.13 — rails refactored from in-grid sticky (3 separate
  // vertical spans per side, sticky-on-scroll) to viewport-fixed
  // editorial metadata (one continuous caption per side, joined with
  // ` · ` separators, `position: fixed` so they're always visible
  // regardless of scroll). The sticky variant worked mechanically
  // after Sprint 29.12 but read as hero decoration rather than page
  // chrome. Fixed positioning matches Open Design's reference where
  // rails feel like permanent viewport metadata attached to the
  // outer page frame.
  describe('Sprint 29.13 — viewport-fixed landing rails', () => {
    it('renders the fixed landing-page rails container with pointer-events disabled', () => {
      render(<ParserLandingShell workspaceName="Demo" />);
      const rails = screen.getByTestId('landing-page-rails');
      expect(rails).toBeInTheDocument();
      // Container is decorative + non-interactive so the upload card,
      // FAB pill, and any clickable content underneath stay reachable.
      expect(rails.className).toMatch(/\bpointer-events-none\b/);
      // Hidden on mobile so vertical labels never crowd a 375px viewport.
      expect(rails.className).toMatch(/\bhidden\b/);
      expect(rails.className).toMatch(/\bmd:block\b/);
    });

    it('renders one continuous caption per side, joined with " · " separators', () => {
      render(<ParserLandingShell workspaceName="Demo" />);
      const left = screen.getByTestId('landing-page-rails-left');
      const right = screen.getByTestId('landing-page-rails-right');
      // Single span per side carries the whole caption (not three).
      expect(left.textContent ?? '').toBe(
        'PARSER-FIRST · NJ LEASES · TENANT LAW',
      );
      expect(right.textContent ?? '').toBe('NJSA · CLAUSES · RED FLAGS');
      // Both spans are aria-hidden — they're page-chrome metadata,
      // not content for screen readers (the corresponding info lives
      // in the brand strip + body copy).
      expect(left).toHaveAttribute('aria-hidden', 'true');
      expect(right).toHaveAttribute('aria-hidden', 'true');
    });

    it('rail spans are fixed-positioned and vertically centered', () => {
      render(<ParserLandingShell workspaceName="Demo" />);
      const left = screen.getByTestId('landing-page-rails-left');
      const right = screen.getByTestId('landing-page-rails-right');
      // `position: fixed` decouples the rails from any scrolling
      // ancestor — they always sit at the page edge regardless of
      // scroll position, drawer state, or section nesting.
      expect(left.className).toMatch(/\bfixed\b/);
      expect(right.className).toMatch(/\bfixed\b/);
      // Vertically centered via top-1/2 + -translate-y-1/2.
      expect(left.className).toMatch(/\btop-1\/2\b/);
      expect(left.className).toMatch(/-translate-y-1\/2/);
      expect(right.className).toMatch(/\btop-1\/2\b/);
      expect(right.className).toMatch(/-translate-y-1\/2/);
    });

    it('rail spans use vertical writing mode so the caption reads top-to-bottom', () => {
      render(<ParserLandingShell workspaceName="Demo" />);
      const left = screen.getByTestId('landing-page-rails-left');
      const right = screen.getByTestId('landing-page-rails-right');
      // Tailwind arbitrary writing-mode utilities — left rotates
      // clockwise (vertical-rl), right rotates counter-clockwise
      // (vertical-lr) so both read top-to-bottom from the page
      // observer's perspective.
      expect(left.className).toMatch(/\[writing-mode:vertical-rl\]/);
      expect(right.className).toMatch(/\[writing-mode:vertical-lr\]/);
    });

    it('rail spans use the subtle muted-warm-gray editorial styling per PRD', () => {
      render(<ParserLandingShell workspaceName="Demo" />);
      const left = screen.getByTestId('landing-page-rails-left');
      // 11px font, mono, medium weight, 0.22em tracking, uppercase,
      // ~55% opacity on the foreground subtle token — hits the PRD's
      // "subtle, narrow, warm" target.
      expect(left.className).toMatch(/\bfont-mono\b/);
      expect(left.className).toMatch(/\btext-\[11px\]/);
      expect(left.className).toMatch(/\bfont-medium\b/);
      expect(left.className).toMatch(/tracking-\[0\.22em\]/);
      expect(left.className).toMatch(/\buppercase\b/);
      expect(left.className).toMatch(/text-fg-subtle\/55/);
    });

    it('does NOT render the obsolete in-grid sticky rail testids', () => {
      // Regression guard: the Sprint 29.x sticky rails are fully
      // replaced. Any future re-introduction would re-create the
      // visual-busy + section-scoped problem Sprint 29.13 fixed.
      render(<ParserLandingShell workspaceName="Demo" />);
      expect(
        screen.queryByTestId('parser-landing-rail-left'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('parser-landing-rail-right'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('parser-landing-rail-sticky-left'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('parser-landing-rail-sticky-right'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('parser-landing-margin-left'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('parser-landing-margin-right'),
      ).not.toBeInTheDocument();
    });
  });

  it('styles capability pills with terracotta hover transitions (Sprint 29.x)', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    const pills = screen.getAllByTestId('parser-landing-capability-pill');
    expect(pills.length).toBeGreaterThanOrEqual(4);
    for (const pill of pills) {
      expect(pill.className).toMatch(/hover:bg-accent-50/);
      expect(pill.className).toMatch(/hover:text-accent-700/);
      expect(pill.className).toMatch(/hover:border-accent/);
      expect(pill.className).toMatch(/motion-safe:/);
      expect(pill.className).toMatch(/cursor-default/);
    }
  });

  it('renders a two-panel scroll band below the support strip (Sprint 29.x)', () => {
    render(<ParserLandingShell workspaceName="Demo" />);
    expect(screen.getByTestId('parser-landing-panels')).toBeInTheDocument();
    expect(
      screen.getByTestId('parser-landing-panel-capabilities'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('parser-landing-panel-privacy'),
    ).toBeInTheDocument();
    expect(screen.getByText(/what you get/i)).toBeInTheDocument();
    expect(screen.getByText(/your lease, your data/i)).toBeInTheDocument();
    expect(screen.getByText(/nj lease pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/njsa citations/i)).toBeInTheDocument();
    expect(
      screen.getByText(/never embedded into the public rag index/i),
    ).toBeInTheDocument();
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
