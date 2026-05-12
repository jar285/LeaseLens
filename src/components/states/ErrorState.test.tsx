import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ErrorState } from './ErrorState';

describe('ErrorState', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the required title', () => {
    render(<ErrorState title="Upload failed" />);
    expect(screen.getByText('Upload failed')).toBeInTheDocument();
  });

  it('defaults to role="alert" so screen readers announce immediately', () => {
    render(<ErrorState title="Something broke" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('switches to role="status" when explicitly requested', () => {
    render(<ErrorState title="Soft warning" role="status" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders optional icon, description, and actions when provided', () => {
    render(
      <ErrorState
        icon={<span data-testid="error-icon" aria-hidden="true" />}
        title="PDF rejected"
        description="Please upload a PDF (application/pdf)."
        actions={
          <button type="button" data-testid="error-action">
            Try another file
          </button>
        }
      />,
    );
    expect(screen.getByTestId('error-icon')).toBeInTheDocument();
    expect(
      screen.getByText('Please upload a PDF (application/pdf).'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('error-action')).toBeInTheDocument();
  });

  it('uses centered variant by default with danger-tinted background', () => {
    const { container } = render(<ErrorState title="x" />);
    const root = container.firstChild as HTMLElement;
    expect(root.dataset.variant).toBe('centered');
    expect(root.className).toContain('bg-danger-100/40');
  });

  it('switches to inline variant when requested (no background tint)', () => {
    const { container } = render(<ErrorState title="x" variant="inline" />);
    const root = container.firstChild as HTMLElement;
    expect(root.dataset.variant).toBe('inline');
    expect(root.className).not.toContain('bg-danger-100/40');
  });

  it('forwards a testId to the outermost element', () => {
    render(<ErrorState title="x" testId="my-error" />);
    expect(screen.getByTestId('my-error')).toBeInTheDocument();
  });
});
