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

  // Sprint 26c — `initialText` lets the assistant FAB seed the textarea
  // when "Explain this clause" / "Draft email" fires from a red-flag
  // card or clause row.
  describe('initialText prefill (Sprint 26c)', () => {
    it('renders the prefill text in the textarea on mount when initialText is provided', () => {
      render(
        <ChatComposer
          isLocked={false}
          onSubmit={vi.fn()}
          initialText="Explain clause §3"
        />,
      );
      const textarea = screen.getByLabelText(
        'Type a message',
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe('Explain clause §3');
    });

    it('hides the slash hint when prefilled (textarea has content from mount)', () => {
      render(
        <ChatComposer
          isLocked={false}
          onSubmit={vi.fn()}
          initialText="Explain clause §3"
        />,
      );
      const hint = screen.queryByTestId('composer-slash-hint');
      if (hint) {
        expect(hint.className).toMatch(/\bopacity-0\b/);
      }
    });

    it('submitting the prefilled text forwards it to onSubmit and clears the textarea', () => {
      const onSubmit = vi.fn();
      render(
        <ChatComposer
          isLocked={false}
          onSubmit={onSubmit}
          initialText="Prefilled body"
        />,
      );
      const textarea = screen.getByLabelText(
        'Type a message',
      ) as HTMLTextAreaElement;
      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(onSubmit).toHaveBeenCalledWith('Prefilled body');
      expect(textarea.value).toBe('');
    });
  });

  // Sprint 36.6 — unified footer card. When suggestion chips render
  // directly above the composer (empty transcript in the FAB drawer),
  // the composer drops its OWN top divider so chips + input read as one
  // calm footer block instead of two separately-fenced bands. The
  // divider then lives once, above the chip eyebrow (Refactoring UI:
  // group with spacing + a single separator, not stacked borders).
  describe('Sprint 36.6 — grouped (attached to suggestion chips)', () => {
    it('ungrouped (default): keeps its own top divider', () => {
      render(<ChatComposer isLocked={false} onSubmit={vi.fn()} />);
      const root = screen.getByTestId('chat-composer');
      expect(root.className).toContain('border-t border-neutral-100');
      expect(root).not.toHaveAttribute('data-grouped');
    });

    it('grouped: drops the top divider so chips + input read as one card', () => {
      render(<ChatComposer isLocked={false} onSubmit={vi.fn()} grouped />);
      const root = screen.getByTestId('chat-composer');
      expect(root.className).not.toContain('border-t');
      expect(root).toHaveAttribute('data-grouped', 'true');
    });
  });

  // Sprint 37.1 — state-aware placeholder. The clause/rewrite default only
  // applies once a lease is attached; before upload the FAB passes a
  // general-help string so the composer doesn't offer a clause-specific
  // affordance the user can't act on.
  describe('Sprint 37.1 — state-aware placeholder', () => {
    it('falls back to the lease-context default when no placeholder is provided', () => {
      render(<ChatComposer isLocked={false} onSubmit={vi.fn()} />);
      const ta = screen.getByLabelText('Type a message') as HTMLTextAreaElement;
      expect(ta.placeholder).toMatch(/clause/i);
      expect(ta.placeholder).toMatch(/\/ for actions/i);
    });

    it('renders a custom (no-lease) placeholder when provided', () => {
      render(
        <ChatComposer
          isLocked={false}
          onSubmit={vi.fn()}
          placeholder="Ask a general question…"
        />,
      );
      const ta = screen.getByLabelText('Type a message') as HTMLTextAreaElement;
      expect(ta.placeholder).toBe('Ask a general question…');
      expect(ta.placeholder).not.toMatch(/clause/i);
    });
  });

  // Sprint 38.1 — guard: the send button's disabled state must visibly track
  // the input (empty → disabled; draft → enabled; locked → disabled). Material
  // Design state discipline + a11y (the control communicates its own state).
  // Locked here as a regression net BEFORE the 38.2 command-bar reskin.
  describe('Sprint 38.1 — send button disabled-state guard', () => {
    it('is disabled when the input is empty and enables once a draft is typed', () => {
      render(<ChatComposer isLocked={false} onSubmit={vi.fn()} />);
      const send = screen.getByRole('button', { name: 'Send message' });
      expect(send).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Type a message'), {
        target: { value: 'What does my deposit clause say?' },
      });
      expect(send).toBeEnabled();
    });

    it('is disabled while locked (sending) even with a draft present', () => {
      render(
        <ChatComposer
          isLocked={true}
          onSubmit={vi.fn()}
          initialText="A pending question"
        />,
      );
      expect(
        screen.getByRole('button', { name: 'Send message' }),
      ).toBeDisabled();
    });
  });
});
