// Sprint 42 — /accessibility renders the statement sections inside the shell.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LEASELENS_ACCESSIBILITY } from '@/lib/content/accessibility';
import AccessibilityPage from './page';

afterEach(cleanup);

describe('Accessibility page', () => {
  it('renders the title, every section heading, and the footer', () => {
    render(<AccessibilityPage />);
    expect(
      screen.getByRole('heading', { name: 'Accessibility' }),
    ).toBeInTheDocument();
    for (const section of LEASELENS_ACCESSIBILITY.sections) {
      expect(screen.getByText(section.heading)).toBeInTheDocument();
    }
    expect(screen.getByTestId('site-footer')).toBeInTheDocument();
  });
});
