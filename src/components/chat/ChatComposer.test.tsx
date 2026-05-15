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
    // Sprint 23c Phase 3 — min-height bumped from 38 to 44 to clear the
    // touch-target floor as a tappable input on mobile + give the
    // composer more visual weight as a command bar.
    setScrollHeightGetter(textarea, () => (textarea.value ? 128 : 44));
    fireEvent.change(textarea, { target: { value: 'Please schedule this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(onSubmit).toHaveBeenCalledWith('Please schedule this');
    expect(textarea).toHaveValue('');
    expect(textarea).toHaveStyle({ height: '44px', overflowY: 'hidden' });
  });

  // Sprint 23c Phase 3 — command-bar polish: bigger touch target,
  // refreshed placeholder copy, visible "/" slash-command hint kbd at
  // idle (no actual slash-command behavior — visual hint only).
  describe('Sprint 23c — command-bar polish', () => {
    it('textarea min-height is 44px (was 38) — canonical min-h-11', () => {
      render(<ChatComposer isLocked={false} onSubmit={vi.fn()} />);
      const textarea = screen.getByLabelText('Type a message');
      expect(textarea.className).toMatch(/\bmin-h-11\b/);
      expect(textarea.className).not.toMatch(/min-h-\[38px\]/);
    });

    it('placeholder mentions clause + rewrite + slash-actions', () => {
      render(<ChatComposer isLocked={false} onSubmit={vi.fn()} />);
      const textarea = screen.getByLabelText(
        'Type a message',
      ) as HTMLTextAreaElement;
      expect(textarea.placeholder).toMatch(/clause/i);
      expect(textarea.placeholder).toMatch(/rewrite/i);
      expect(textarea.placeholder).toMatch(/\/ for actions/i);
    });

    it('renders a "/" slash-command hint kbd that is visible when the textarea is empty', () => {
      render(<ChatComposer isLocked={false} onSubmit={vi.fn()} />);
      const hint = screen.getByTestId('composer-slash-hint');
      expect(hint.tagName).toBe('KBD');
      expect(hint).toHaveTextContent('/');
      // Visible when empty — the wrapper does not carry the hidden modifier.
      expect(hint.className).not.toMatch(/\bopacity-0\b/);
    });

    it('hides the slash hint once the user types in the textarea', () => {
      render(<ChatComposer isLocked={false} onSubmit={vi.fn()} />);
      const textarea = screen.getByLabelText('Type a message');
      fireEvent.change(textarea, { target: { value: 'hello' } });
      // Either the hint is unmounted or carries the hidden treatment.
      const hint = screen.queryByTestId('composer-slash-hint');
      if (hint) {
        expect(hint.className).toMatch(/\bopacity-0\b/);
      }
    });
  });
});
