// Sprint 41 — /sources lists the NJ tenant-law sources behind citations.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LEASELENS_NJ_SOURCES } from '@/lib/content/nj-sources';
import SourcesPage from './page';

afterEach(cleanup);

describe('Sources page', () => {
  it('renders the title, every source citation + title, and the footer', () => {
    render(<SourcesPage />);
    expect(
      screen.getByRole('heading', { name: /sources/i }),
    ).toBeInTheDocument();
    for (const source of LEASELENS_NJ_SOURCES) {
      expect(screen.getByText(source.citation)).toBeInTheDocument();
      expect(screen.getByText(source.title)).toBeInTheDocument();
    }
    expect(screen.getByTestId('site-footer')).toBeInTheDocument();
  });
});
