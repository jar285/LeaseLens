import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatComposer } from './ChatComposer';

function setScrollHeight(textarea: HTMLElement, scrollHeight: number) {
  Object.defineProperty(textarea, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  });
}

function setScrollHeightGetter(textarea: HTMLElement, getHeight: () => number) {
  Object.defineProperty(textarea, 'scrollHeight', {
    configurable: true,
    get: getHeight,
  });
}

describe('ChatComposer', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a labelled textarea and send button', () => {
    render(<ChatComposer isLocked={false} onSubmit={vi.fn()} />);

    expect(screen.getByLabelText('Type a message')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send message' }),
    ).toBeInTheDocument();
  });

  it('submits once on Enter when unlocked and non-empty', () => {
    const onSubmit = vi.fn();
    render(<ChatComposer isLocked={false} onSubmit={onSubmit} />);

    const textarea = screen.getByLabelText('Type a message');
    fireEvent.change(textarea, { target: { value: 'Draft a launch post' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('Draft a launch post');
  });

  it('does not submit on Shift+Enter', () => {
    const onSubmit = vi.fn();
    render(<ChatComposer isLocked={false} onSubmit={onSubmit} />);

    const textarea = screen.getByLabelText('Type a message');
    fireEvent.change(textarea, { target: { value: 'Line one' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit empty or locked input', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <ChatComposer isLocked={false} onSubmit={onSubmit} />,
    );

    const textarea = screen.getByLabelText('Type a message');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    rerender(<ChatComposer isLocked={true} onSubmit={onSubmit} />);
    fireEvent.change(textarea, { target: { value: 'Locked prompt' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sets textarea height from scrollHeight below the maximum', () => {
    render(<ChatComposer isLocked={false} onSubmit={vi.fn()} />);

    const textarea = screen.getByLabelText('Type a message');
    setScrollHeight(textarea, 96);
    fireEvent.change(textarea, { target: { value: 'Line one\nLine two' } });

    expect(textarea).toHaveStyle({ height: '96px', overflowY: 'hidden' });
  });

  it('caps textarea height and enables internal scroll above the maximum', () => {
    render(<ChatComposer isLocked={false} onSubmit={vi.fn()} />);

    const textarea = screen.getByLabelText('Type a message');
    setScrollHeight(textarea, 240);
    fireEvent.change(textarea, {
      target: { value: 'Line one\nLine two\nLine three\nLine four' },
    });

    expect(textarea).toHaveStyle({ height: '192px', overflowY: 'auto' });
  });

  it('clears submitted text and resets to one-row height', () => {
    const onSubmit = vi.fn();
    render(<ChatComposer isLocked={false} onSubmit={onSubmit} />);

    const textarea = screen.getByLabelText(
      'Type a message',
    ) as HTMLTextAreaElement;
    setScrollHeightGetter(textarea, () => (textarea.value ? 128 : 38));
    fireEvent.change(textarea, { target: { value: 'Please schedule this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(onSubmit).toHaveBeenCalledWith('Please schedule this');
    expect(textarea).toHaveValue('');
    expect(textarea).toHaveStyle({ height: '38px', overflowY: 'hidden' });
  });
});
