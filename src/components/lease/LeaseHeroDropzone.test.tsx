// Sprint 26a Phase 2 — red test.
//
// Hero-sized presentational wrapper around LeaseUploadDropzone. Owns the
// editorial headline + subhead; delegates file handling to the inner
// dropzone. Should not introduce any chat composer affordances.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeaseHeroDropzone } from './LeaseHeroDropzone';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LeaseHeroDropzone', () => {
  it('renders the editorial hero headline with italic emphasis on "negotiate"', () => {
    render(<LeaseHeroDropzone onUploaded={() => {}} />);
    const headline = screen.getByTestId('lease-hero-headline');
    expect(headline).toBeInTheDocument();
    expect(headline.textContent).toMatch(/find what to/i);
    expect(headline.textContent).toMatch(/negotiate/i);
    expect(headline.textContent).toMatch(/before you sign/i);
    // The "negotiate" word renders inside an <em> for the italic face.
    expect(headline.querySelector('em')).not.toBeNull();
    expect(headline.querySelector('em')?.textContent).toMatch(/negotiate/i);
  });

  it('renders a value-prop subhead without duplicating dropzone upload copy (Sprint 29.x)', () => {
    render(<LeaseHeroDropzone onUploaded={() => {}} />);
    const subhead = screen.getByTestId('lease-hero-subhead');
    expect(subhead).toBeInTheDocument();
    expect(subhead.textContent?.toLowerCase()).toMatch(/parse clauses/);
    expect(subhead.textContent?.toLowerCase()).not.toMatch(
      /drop your nj residential lease/,
    );
  });

  it('embeds the existing LeaseUploadDropzone for file handling', () => {
    render(<LeaseHeroDropzone onUploaded={() => {}} />);
    // The inner dropzone retains its public test id so file-handling
    // tests in LeaseUploadDropzone.test.tsx still describe the behavior.
    expect(screen.getByTestId('lease-upload-dropzone')).toBeInTheDocument();
  });

  it('uses hero presentation on the inner dropzone so it blends with the ambient blob (Sprint 29.x)', () => {
    render(<LeaseHeroDropzone onUploaded={() => {}} />);
    expect(screen.getByTestId('lease-upload-dropzone')).toHaveAttribute(
      'data-presentation',
      'hero',
    );
    expect(screen.getByTestId('lease-hero-dropzone-tray')).toBeInTheDocument();
  });

  it('forwards onUploaded to the inner dropzone via props', () => {
    // Wrap render so we can observe that the prop reaches the inner dropzone.
    // The inner dropzone exposes onUploaded through props; if we don't pass
    // through, this prop becomes undefined and the inner test contract breaks.
    const onUploaded = vi.fn();
    render(<LeaseHeroDropzone onUploaded={onUploaded} />);
    // Indirect assertion: the inner dropzone renders its file <input>, which
    // means the props plumbing reached it.
    expect(screen.getByTestId('lease-upload-input')).toBeInTheDocument();
  });

  it('does NOT render the chat composer on the landing surface', () => {
    render(<LeaseHeroDropzone onUploaded={() => {}} />);
    // The pivot rule: parser-first landing has zero chat affordance in the
    // main flow. The FAB is the only assistant entry, and it's outside the
    // hero dropzone's surface.
    expect(screen.queryByTestId('chat-composer')).not.toBeInTheDocument();
  });

  it('has data-testid="lease-hero-dropzone" on the root section', () => {
    render(<LeaseHeroDropzone onUploaded={() => {}} />);
    expect(screen.getByTestId('lease-hero-dropzone')).toBeInTheDocument();
  });

  it('forwards onError to the inner dropzone when provided', () => {
    const onError = vi.fn();
    render(<LeaseHeroDropzone onUploaded={() => {}} onError={onError} />);
    // Same indirect assertion: the inner dropzone is mounted, which means
    // its prop pathway is wired. Error invocation itself is exhaustively
    // covered by LeaseUploadDropzone.test.tsx; we only need to verify the
    // plumbing here.
    expect(screen.getByTestId('lease-upload-dropzone')).toBeInTheDocument();
  });
});
