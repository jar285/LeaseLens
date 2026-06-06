// Sprint 41 — /privacy reuses the landing privacy panel as its lead (proving
// the two surfaces cannot drift) and expands it into sections.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LEASELENS_PRIVACY } from '@/lib/content/privacy';
import { LEASELENS_DATA_PANEL } from '@/lib/lease/landing-panels';
import PrivacyPage from './page';

afterEach(cleanup);

describe('Privacy page', () => {
  it('renders the reused data-panel headline, every section, and the footer', () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole('heading', { name: 'Privacy & data' }),
    ).toBeInTheDocument();
    // Reuse guard: the landing privacy panel headline must appear verbatim.
    expect(screen.getByText(LEASELENS_DATA_PANEL.headline)).toBeInTheDocument();
    for (const section of LEASELENS_PRIVACY.sections) {
      expect(screen.getByText(section.heading)).toBeInTheDocument();
    }
    expect(screen.getByTestId('site-footer')).toBeInTheDocument();
  });
});
