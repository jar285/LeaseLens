// Sprint 23c Phase 2 — visual card that replaces the synthetic "Lease
// uploaded" intro message in the transcript. Pure presentation: props
// in, JSX out. Filename + meta from context (forwarded as props), action
// chips from SCAN_INTRO_PROMPTS, click dispatch through onSelectPrompt.

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FollowUpPrompt } from '@/lib/chat/follow-up-prompts';
import { UploadedLeaseCard } from './UploadedLeaseCard';

afterEach(cleanup);

const sampleChips: FollowUpPrompt[] = [
  { id: 'a', label: 'Run standard scan', prompt: 'PROMPT_RUN' },
  { id: 'b', label: 'Ask about a clause', prompt: 'PROMPT_ASK' },
  { id: 'c', label: 'Compare to NJ statute', prompt: 'PROMPT_COMPARE' },
  { id: 'd', label: 'Draft a negotiation email', prompt: 'PROMPT_EMAIL' },
];

describe('UploadedLeaseCard', () => {
  it('renders the testid + filename prominently', () => {
    render(
      <UploadedLeaseCard
        filename="sample-nj-residential-lease.pdf"
        pageCount={2}
        clauseCount={15}
        prompts={sampleChips}
        onSelectPrompt={vi.fn()}
      />,
    );
    expect(screen.getByTestId('uploaded-lease-card')).toBeInTheDocument();
    expect(
      screen.getByText('sample-nj-residential-lease.pdf'),
    ).toBeInTheDocument();
  });

  it('renders the "N pages · M clauses" meta line', () => {
    render(
      <UploadedLeaseCard
        filename="lease.pdf"
        pageCount={2}
        clauseCount={15}
        prompts={sampleChips}
        onSelectPrompt={vi.fn()}
      />,
    );
    // Pluralisation: 2 pages, 15 clauses.
    const card = screen.getByTestId('uploaded-lease-card');
    expect(card).toHaveTextContent(/2 pages/i);
    expect(card).toHaveTextContent(/15 clauses/i);
  });

  it('renders one button per prompt, labeled by prompt.label', () => {
    render(
      <UploadedLeaseCard
        filename="lease.pdf"
        pageCount={2}
        clauseCount={15}
        prompts={sampleChips}
        onSelectPrompt={vi.fn()}
      />,
    );
    for (const chip of sampleChips) {
      expect(
        screen.getByRole('button', { name: chip.label }),
      ).toBeInTheDocument();
    }
  });

  it('fires onSelectPrompt with the chip.prompt when a chip is clicked', () => {
    const onSelectPrompt = vi.fn();
    render(
      <UploadedLeaseCard
        filename="lease.pdf"
        pageCount={2}
        clauseCount={15}
        prompts={sampleChips}
        onSelectPrompt={onSelectPrompt}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Run standard scan/i }));
    expect(onSelectPrompt).toHaveBeenCalledTimes(1);
    expect(onSelectPrompt).toHaveBeenCalledWith('PROMPT_RUN');
  });

  it('uses singular pluralisation when counts are 1', () => {
    render(
      <UploadedLeaseCard
        filename="solo.pdf"
        pageCount={1}
        clauseCount={1}
        prompts={sampleChips}
        onSelectPrompt={vi.fn()}
      />,
    );
    // The meta line should read "1 page · 1 clause" — assert that exact
    // string is present anywhere in the card (the body paragraph has
    // "every clause" which is unrelated to the meta pluralisation).
    const card = screen.getByTestId('uploaded-lease-card');
    expect(card.textContent ?? '').toContain('1 page · 1 clause');
    // The plural form must not be present in the meta block. We look
    // specifically for "1 pages" / "1 clauses" (the would-be miss).
    expect(card.textContent ?? '').not.toContain('1 pages');
    expect(card.textContent ?? '').not.toContain('1 clauses');
  });

  it('omits the meta line when pageCount and clauseCount are both undefined', () => {
    render(
      <UploadedLeaseCard
        filename="lease.pdf"
        prompts={sampleChips}
        onSelectPrompt={vi.fn()}
      />,
    );
    const card = screen.getByTestId('uploaded-lease-card');
    // No meta line rendered when counts are missing.
    expect(card.textContent).not.toMatch(/pages?\s*·\s*\d+\s*clauses?/i);
  });

  // Sprint 23c Phase 5 — fade-in entry animation. Without this, the
  // card popped in instantly when scan-narrative.computeScanNarrative
  // produced the synthetic intro on upload-parse, which felt jarring.
  // The motion wrapper renders only after mount (so SSR + first paint
  // match) and only when prefers-reduced-motion is off.
  describe('Sprint 23c Phase 5 — entry animation', () => {
    it('after mount, the card carries the motion-on data attribute', async () => {
      render(
        <UploadedLeaseCard
          filename="lease.pdf"
          pageCount={2}
          clauseCount={15}
          prompts={sampleChips}
          onSelectPrompt={vi.fn()}
        />,
      );
      // jsdom runs effects synchronously enough that the post-mount
      // animate path renders by the time getByTestId returns.
      const card = screen.getByTestId('uploaded-lease-card');
      // useReducedMotion in jsdom defaults to false (no media query
      // matched), so animate path wins.
      expect(card.getAttribute('data-motion')).toBe('on');
    });

    it('renders the same content + chips in the motion-on path (no regression)', () => {
      const onSelectPrompt = vi.fn();
      render(
        <UploadedLeaseCard
          filename="entry.pdf"
          pageCount={3}
          clauseCount={12}
          prompts={sampleChips}
          onSelectPrompt={onSelectPrompt}
        />,
      );
      // Filename + meta + every chip still present even with motion on.
      expect(screen.getByText('entry.pdf')).toBeInTheDocument();
      expect(screen.getByTestId('uploaded-lease-card')).toHaveTextContent(
        /3 pages/,
      );
      for (const chip of sampleChips) {
        expect(
          screen.getByRole('button', { name: chip.label }),
        ).toBeInTheDocument();
      }
      // Chip dispatch still works.
      fireEvent.click(
        screen.getByRole('button', { name: /Run standard scan/i }),
      );
      expect(onSelectPrompt).toHaveBeenCalledWith('PROMPT_RUN');
    });
  });
});
