import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChatStreamProvider,
  useChatStream,
} from '@/components/chat/ChatStreamContext';
import {
  GradingDetailBlock,
  type GradingDetailVerbosity,
} from './GradingDetailBlock';
import type { GradingResult } from './grading';

const baseGrading: GradingResult = {
  clause_id: 'c1',
  severity: 'high',
  statute_citation: 'NJ Stat 46:8-19',
  chunk_id: 'security-deposit-cap#section:1',
  reasoning: 'Two months exceeds the NJ 1.5-month cap.',
  recommended_action: 'Cap the deposit at 1.5 months rent.',
  clause_type: 'security_deposit',
  clause_index: 2,
  page_number: 4,
};

function renderWithProvider(
  grading: GradingResult = baseGrading,
  verbosity?: GradingDetailVerbosity,
) {
  return render(
    <ChatStreamProvider>
      <GradingDetailBlock grading={grading} verbosity={verbosity} />
    </ChatStreamProvider>,
  );
}

describe('GradingDetailBlock', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the severity badge with the High label', () => {
    renderWithProvider();
    const badge = screen.getByTestId('grading-detail-severity');
    expect(badge).toHaveTextContent('High');
  });

  it('exposes the severity via data-severity for downstream styling tests', () => {
    renderWithProvider();
    const block = screen.getByTestId('grading-detail-block');
    expect(block.getAttribute('data-severity')).toBe('high');
  });

  it('formats the clause label as "<type> · §<index+1>"', () => {
    renderWithProvider();
    expect(screen.getByText('Security deposit · §3')).toBeInTheDocument();
  });

  it('renders the reasoning, citation, and recommended action', () => {
    renderWithProvider();
    expect(screen.getByTestId('grading-detail-reasoning')).toHaveTextContent(
      /exceeds the NJ 1.5-month cap/,
    );
    expect(screen.getByTestId('grading-detail-citation')).toHaveTextContent(
      'NJ Stat 46:8-19',
    );
    expect(screen.getByTestId('grading-detail-action')).toHaveTextContent(
      /Cap the deposit/,
    );
  });

  it('renders the View-on-page button when page_number is set', () => {
    renderWithProvider();
    const btn = screen.getByTestId('grading-detail-jump-to-page');
    expect(btn).toHaveTextContent('View on page 4');
  });

  it('hides the View-on-page button when page_number is missing', () => {
    renderWithProvider({ ...baseGrading, page_number: undefined });
    expect(
      screen.queryByTestId('grading-detail-jump-to-page'),
    ).not.toBeInTheDocument();
  });

  // Sprint 18 §4 — citation chip drives the same jump-to-page flow as the
  // "View on page N" button.
  it('clicking the citation chip calls pdfViewerRef.scrollToPage with the grading page', () => {
    const scrollToPage = vi.fn();
    function Wired() {
      const { pdfViewerRef } = useChatStream();
      pdfViewerRef.current = { scrollToPage };
      return <GradingDetailBlock grading={baseGrading} />;
    }
    render(
      <ChatStreamProvider>
        <Wired />
      </ChatStreamProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /NJ Stat 46:8-19/i }));
    expect(scrollToPage).toHaveBeenCalledWith(4);
  });

  it('renders the citation as a non-interactive span when page_number is missing', () => {
    renderWithProvider({ ...baseGrading, page_number: undefined });
    const citationWrap = screen.getByTestId('grading-detail-citation');
    expect(
      citationWrap.querySelector('button[data-testid="citation-chip"]'),
    ).toBeNull();
    expect(
      citationWrap.querySelector('span[data-testid="citation-chip"]'),
    ).toBeInTheDocument();
  });

  it('omits the reasoning / citation / action blocks when their fields are empty strings', () => {
    renderWithProvider({
      ...baseGrading,
      reasoning: '',
      statute_citation: '',
      recommended_action: '',
    });
    expect(
      screen.queryByTestId('grading-detail-reasoning'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('grading-detail-citation'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('grading-detail-action'),
    ).not.toBeInTheDocument();
  });

  // S19.8 — Reviewer / Admin verbosity adds detail on top of the
  // Tenant view. Tenant view is the default; Reviewer gets a corpus-
  // source line; Admin additionally exposes the raw JSON behind a
  // disclosure toggle.
  describe('S19.8 — verbosity', () => {
    it('defaults to tenant verbosity when no prop is passed', () => {
      renderWithProvider();
      expect(
        screen.queryByTestId('grading-detail-source'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('grading-detail-raw-json'),
      ).not.toBeInTheDocument();
    });

    it('tenant verbosity hides corpus-source line and raw JSON', () => {
      renderWithProvider(baseGrading, 'tenant');
      expect(
        screen.queryByTestId('grading-detail-source'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('grading-detail-raw-json'),
      ).not.toBeInTheDocument();
    });

    it('reviewer verbosity surfaces the corpus-source chunk id but NOT raw JSON', () => {
      renderWithProvider(baseGrading, 'reviewer');
      const source = screen.getByTestId('grading-detail-source');
      expect(source).toBeInTheDocument();
      expect(source).toHaveTextContent('security-deposit-cap#section:1');
      expect(
        screen.queryByTestId('grading-detail-raw-json'),
      ).not.toBeInTheDocument();
    });

    it('admin verbosity surfaces BOTH the corpus-source line and a collapsed raw-JSON block', () => {
      renderWithProvider(baseGrading, 'admin');
      expect(screen.getByTestId('grading-detail-source')).toBeInTheDocument();
      const rawJsonToggle = screen.getByTestId('grading-detail-raw-json');
      expect(rawJsonToggle).toBeInTheDocument();
      // Closed-by-default: the <details> open attribute is absent.
      expect(rawJsonToggle.hasAttribute('open')).toBe(false);
    });

    it('admin raw-JSON section contains the full grading payload when expanded', () => {
      renderWithProvider(baseGrading, 'admin');
      const block = screen.getByTestId('grading-detail-raw-json');
      // The JSON content is rendered inside the details element regardless
      // of open state — assert content directly.
      expect(block.textContent).toContain('"clause_id"');
      expect(block.textContent).toContain('"security-deposit-cap#section:1"');
    });
  });
});
