// Sprint 23f Phase 1 — NegotiationEmailCard primitive + clipboard.
//
// Pure presentation: props in, JSX out, plus one internal `copied`
// boolean for the transient Copy-button feedback state. The clipboard
// interaction uses navigator.clipboard.writeText() and is feature-
// detected (disabled fallback when the API is unavailable).

import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NegotiationEmailCard } from './NegotiationEmailCard';

// Mock useReducedMotion at module scope so individual tests can flip
// the return value between the motion-on and reduced-motion paths.
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

// Stub navigator.clipboard.writeText for each test that needs the
// happy-path. The disabled-fallback test stubs the clipboard property
// to undefined.
function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  return { writeText };
}

beforeEach(() => {
  stubClipboard();
  useReducedMotionMock.mockReturnValue(false);
});

const sampleSubject = 'Request to Revise Security Deposit Language';
const sampleBody = `Hi [Landlord Name],

Thank you for sending over the lease. I reviewed the security-deposit clause and noticed it requires two months' rent ($4,800), which exceeds NJ Stat 46:8-19's 1.5-month cap.

Would you be open to reducing the deposit to $3,600 (1.5× monthly rent) and holding it in an interest-bearing account, with the accrued interest credited to me annually as the statute requires?

Thanks,
[Tenant]`;

describe('NegotiationEmailCard', () => {
  it('renders with the negotiation-email-card testid and clause label', () => {
    render(
      <NegotiationEmailCard
        clauseLabel="Security deposit · §3"
        severity="high"
        subject={sampleSubject}
        body={sampleBody}
      />,
    );
    const card = screen.getByTestId('negotiation-email-card');
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('Security deposit · §3');
  });

  it('renders the subject and body verbatim, preserving line breaks', () => {
    render(
      <NegotiationEmailCard
        clauseLabel="Security deposit · §3"
        severity="high"
        subject={sampleSubject}
        body={sampleBody}
      />,
    );
    expect(screen.getByText(sampleSubject)).toBeInTheDocument();
    // Verify line-break preservation via whitespace-pre-line on the body
    // container (or via the body text node carrying the full multi-line
    // string).
    const body = screen.getByTestId('negotiation-email-card-body');
    expect(body.className).toMatch(/whitespace-pre-line/);
    expect(body.textContent ?? '').toContain('Hi [Landlord Name]');
    expect(body.textContent ?? '').toContain('Thanks,\n[Tenant]');
  });

  it('renders a SeverityBadge when severity is given', () => {
    render(
      <NegotiationEmailCard
        clauseLabel="Security deposit · §3"
        severity="high"
        subject={sampleSubject}
        body={sampleBody}
      />,
    );
    const card = screen.getByTestId('negotiation-email-card');
    const badge = card.querySelector('[data-testid="severity-badge"]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('data-severity')).toBe('high');
  });

  it('omits the SeverityBadge when severity is undefined', () => {
    render(
      <NegotiationEmailCard
        clauseLabel="Some clause"
        subject={sampleSubject}
        body={sampleBody}
      />,
    );
    const card = screen.getByTestId('negotiation-email-card');
    const badge = card.querySelector('[data-testid="severity-badge"]');
    expect(badge).toBeNull();
  });

  it('writes the body to clipboard when Copy is clicked', async () => {
    const { writeText } = stubClipboard();
    render(
      <NegotiationEmailCard
        clauseLabel="Security deposit · §3"
        severity="high"
        subject={sampleSubject}
        body={sampleBody}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(sampleBody);
  });

  it('shows a "Copied" feedback state briefly after Copy is clicked', async () => {
    vi.useFakeTimers();
    try {
      render(
        <NegotiationEmailCard
          clauseLabel="Security deposit · §3"
          severity="high"
          subject={sampleSubject}
          body={sampleBody}
        />,
      );
      const button = screen.getByRole('button', { name: /copy/i });
      fireEvent.click(button);
      // After click, the button enters the "copied" state.
      expect(button.getAttribute('data-state')).toBe('copied');
      // After the feedback window expires, it reverts.
      act(() => {
        vi.advanceTimersByTime(2_000);
      });
      expect(button.getAttribute('data-state')).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables the Copy button when navigator.clipboard is unavailable', () => {
    // Remove the clipboard stub for this test.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    render(
      <NegotiationEmailCard
        clauseLabel="Security deposit · §3"
        severity="high"
        subject={sampleSubject}
        body={sampleBody}
      />,
    );
    const button = screen.getByRole('button', { name: /copy/i });
    expect(button).toBeDisabled();
  });

  // Sprint 23f Phase 3 — entry fade-in animation matching the
  // UploadedLeaseCard pattern (350ms, opacity + 16px y-translate).
  describe('Sprint 23f Phase 3 — entry animation', () => {
    it('carries data-motion="on" when reduced motion is off', () => {
      useReducedMotionMock.mockReturnValue(false);
      render(
        <NegotiationEmailCard
          clauseLabel="Security deposit · §3"
          severity="high"
          subject={sampleSubject}
          body={sampleBody}
        />,
      );
      const card = screen.getByTestId('negotiation-email-card');
      expect(card.getAttribute('data-motion')).toBe('on');
    });

    it('carries data-motion="off" and renders plain DOM under reduced motion', () => {
      useReducedMotionMock.mockReturnValue(true);
      render(
        <NegotiationEmailCard
          clauseLabel="Security deposit · §3"
          severity="high"
          subject={sampleSubject}
          body={sampleBody}
        />,
      );
      const card = screen.getByTestId('negotiation-email-card');
      expect(card.getAttribute('data-motion')).toBe('off');
    });
  });
});
