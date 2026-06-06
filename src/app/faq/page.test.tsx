// Sprint 41 — /faq renders every FAQ entry inside the content shell.
// The page is a plain sync server component, so it renders directly.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LEASELENS_FAQ } from '@/lib/content/faq';
import FaqPage from './page';

afterEach(cleanup);

describe('FAQ page', () => {
  it('renders the FAQ title, every Q&A, and the footer', () => {
    render(<FaqPage />);
    expect(screen.getByRole('heading', { name: 'FAQ' })).toBeInTheDocument();
    for (const item of LEASELENS_FAQ) {
      expect(screen.getByText(item.question)).toBeInTheDocument();
      expect(screen.getByText(item.answer)).toBeInTheDocument();
    }
    expect(screen.getByTestId('site-footer')).toBeInTheDocument();
  });
});
