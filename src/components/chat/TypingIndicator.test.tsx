import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TypingIndicator } from './TypingIndicator';

describe('TypingIndicator', () => {
  afterEach(cleanup);

  it('renders three animate-bounce spans with staggered delays', () => {
    const { container } = render(<TypingIndicator />);
    const spans = container.querySelectorAll('span.animate-bounce');
    expect(spans).toHaveLength(3);
    const delays = Array.from(spans).map(
      (s) => (s as HTMLElement).style.animationDelay,
    );
    expect(delays).toEqual(['0ms', '150ms', '300ms']);
  });

  it('exposes role=status and aria-label for screen readers', () => {
    render(<TypingIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Assistant is composing');
  });
});
