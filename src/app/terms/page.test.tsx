// Sprint 42 — /terms renders the Terms of Use sections inside the shell.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LEASELENS_TERMS } from '@/lib/content/terms';
import TermsPage from './page';

afterEach(cleanup);

describe('Terms page', () => {
  it('renders the title, every section heading, and the footer', () => {
    render(<TermsPage />);
    expect(
      screen.getByRole('heading', { name: 'Terms of use' }),
    ).toBeInTheDocument();
    for (const section of LEASELENS_TERMS.sections) {
      expect(screen.getByText(section.heading)).toBeInTheDocument();
    }
    expect(screen.getByTestId('site-footer')).toBeInTheDocument();
  });
});
