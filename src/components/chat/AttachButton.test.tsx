import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttachButton } from './AttachButton';

describe('AttachButton', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders an accessible attach button', () => {
    render(<AttachButton onFiles={() => {}} />);
    expect(
      screen.getByRole('button', { name: /Attach brand files/i }),
    ).toBeInTheDocument();
  });

  it('clicking the button triggers a click on the hidden file input', () => {
    render(<AttachButton onFiles={() => {}} />);
    const input = screen.getByTestId('attach-button-input');
    const click = vi.spyOn(input, 'click');
    fireEvent.click(
      screen.getByRole('button', { name: /Attach brand files/i }),
    );
    expect(click).toHaveBeenCalled();
  });

  it('selecting .md files calls onFiles with the accepted list', () => {
    const onFiles = vi.fn();
    render(<AttachButton onFiles={onFiles} />);
    const input = screen.getByTestId('attach-button-input');
    const file = new File(['x'], 'brand.md', { type: 'text/markdown' });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0][0].name).toBe('brand.md');
  });

  it('silently filters out non-md selections', () => {
    const onFiles = vi.fn();
    render(<AttachButton onFiles={onFiles} />);
    const input = screen.getByTestId('attach-button-input');
    const png = new File(['x'], 'logo.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [png] });
    fireEvent.change(input);
    expect(onFiles).not.toHaveBeenCalled();
  });
});
