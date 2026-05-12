import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChatStreamProvider,
  useChatStream,
} from '@/components/chat/ChatStreamContext';
import { GradingDetailBlock } from './GradingDetailBlock';
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

function renderWithProvider(grading: GradingResult = baseGrading) {
  return render(
    <ChatStreamProvider>
      <GradingDetailBlock grading={grading} />
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
});
