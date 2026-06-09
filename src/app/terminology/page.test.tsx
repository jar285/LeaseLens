// Sprint 42 — /terminology renders the glossary terms inside the shell.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LEASELENS_TERMINOLOGY } from '@/lib/content/terminology';
import TerminologyPage from './page';

afterEach(cleanup);

describe('Terminology page', () => {
  it('renders the title, every glossary term, and the footer', () => {
    render(<TerminologyPage />);
    expect(
      screen.getByRole('heading', { name: 'Terminology' }),
    ).toBeInTheDocument();
    for (const entry of LEASELENS_TERMINOLOGY) {
      expect(screen.getByText(entry.term)).toBeInTheDocument();
    }
    expect(screen.getByTestId('site-footer')).toBeInTheDocument();
  });
});
