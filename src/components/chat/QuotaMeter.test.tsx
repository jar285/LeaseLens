// Sprint D.17ui (#17, #25) — QuotaMeter: the drawer's usage indicator.
//
// Pure presenter (props in, JSX out — mirrors the AssistantContextBar split:
// ChatUI owns the stream state, this renders it). Progressive disclosure
// (Dieter Rams / Caregiver voice: quiet until it matters, calm at the limit):
//   AMPLE   → renders nothing (parser-first surface stays clean);
//   LOW     → slim draining meter + "N questions left this hour"
//             (role=progressbar, warning tone, icon+text — never color alone);
//   AT-LIMIT→ the calm paused notice (typed budget event / 429), keeping the
//             `budget-notice` testid + copy pinned by ChatUI.budget.test.
// Motion: the fill animates via transform only, gated by useReducedMotion
// (data-motion attr, house pattern).

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUOTA_LOW_THRESHOLD, QuotaMeter } from './QuotaMeter';

const useReducedMotionMock = vi.fn().mockReturnValue(false);
vi.mock('motion/react', async () => {
  const actual =
    await vi.importActual<typeof import('motion/react')>('motion/react');
  return {
    ...actual,
    useReducedMotion: () => useReducedMotionMock(),
  };
});

afterEach(cleanup);
beforeEach(() => {
  useReducedMotionMock.mockReturnValue(false);
});

describe('QuotaMeter — ample headroom', () => {
  it('renders nothing above the low threshold', () => {
    const { container } = render(
      <QuotaMeter quota={{ remaining: 50, limit: 60 }} pause={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no quota has been received yet', () => {
    const { container } = render(<QuotaMeter quota={null} pause={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('QuotaMeter — low state (progressive meter)', () => {
  it('shows at exactly the threshold with count text, meter semantics, and an icon', () => {
    const remaining = Math.floor(60 * QUOTA_LOW_THRESHOLD); // 24 of 60
    render(<QuotaMeter quota={{ remaining, limit: 60 }} pause={null} />);
    const meter = screen.getByTestId('quota-meter');
    // Triple channel: text …
    expect(meter.textContent).toMatch(/24 questions left this hour/i);
    // … + meter semantics (WCAG: value exposed to AT) …
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '24');
    expect(bar).toHaveAttribute('aria-valuemax', '60');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar.getAttribute('aria-label') ?? '').toMatch(/question/i);
    // … + an icon shape (aria-hidden; the text is the accessible channel).
    expect(meter.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    // Warning tone on the fill — tokens, not raw amber.
    const fill = screen.getByTestId('quota-meter-fill');
    expect(fill.className).toContain('bg-warning-600');
    // Draining fill is transform-based (never width — layout-animation ban).
    expect(fill.style.transform).toContain('scaleX(0.4');
  });

  it('uses singular copy for 1 remaining', () => {
    render(<QuotaMeter quota={{ remaining: 1, limit: 60 }} pause={null} />);
    expect(screen.getByTestId('quota-meter').textContent).toMatch(
      /1 question left this hour/i,
    );
    expect(screen.getByTestId('quota-meter').textContent).not.toMatch(
      /1 questions/i,
    );
  });

  it('legacy quota without a limit falls back to text-only (no progressbar)', () => {
    render(<QuotaMeter quota={{ remaining: 2 }} pause={null} />);
    const meter = screen.getByTestId('quota-meter');
    expect(meter.textContent).toMatch(/2 questions left this hour/i);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('hides the legacy text-only state above 2 remaining', () => {
    const { container } = render(
      <QuotaMeter quota={{ remaining: 5 }} pause={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('data-motion follows reduced-motion (static fill, no transition)', () => {
    useReducedMotionMock.mockReturnValue(true);
    render(<QuotaMeter quota={{ remaining: 10, limit: 60 }} pause={null} />);
    expect(screen.getByTestId('quota-meter').getAttribute('data-motion')).toBe(
      'off',
    );

    cleanup();
    useReducedMotionMock.mockReturnValue(false);
    render(<QuotaMeter quota={{ remaining: 10, limit: 60 }} pause={null} />);
    expect(screen.getByTestId('quota-meter').getAttribute('data-motion')).toBe(
      'on',
    );
  });
});

describe('QuotaMeter — at-limit notice (contract pinned by ChatUI.budget.test)', () => {
  it('daily scope: calm paused copy naming what still works, role=status', () => {
    render(<QuotaMeter quota={null} pause={{ scope: 'daily' }} />);
    const notice = screen.getByTestId('budget-notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice.textContent).toMatch(/paused for today/i);
    expect(notice.textContent).toMatch(/lease review/i);
    expect(notice.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('rate scope: question-limit copy with reset expectation', () => {
    render(
      <QuotaMeter
        quota={null}
        pause={{ scope: 'rate', retryAfterSeconds: 1800 }}
      />,
    );
    const notice = screen.getByTestId('budget-notice');
    expect(notice.textContent).toMatch(/question limit/i);
    expect(notice.textContent).toMatch(/resets/i);
    expect(notice.textContent).toMatch(/lease review/i);
  });

  it('the pause notice wins over a stale low meter (no double banner)', () => {
    render(
      <QuotaMeter
        quota={{ remaining: 0, limit: 60 }}
        pause={{ scope: 'rate' }}
      />,
    );
    expect(screen.getByTestId('budget-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('quota-meter')).toBeNull();
  });
});
