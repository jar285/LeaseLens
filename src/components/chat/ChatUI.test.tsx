// Sprint 52.2 — chat-thread overflow menu.
//
// The persistent "Clear assistant chat" toolbar strip is replaced by a slim
// floating overflow (⋯) trigger that opens a disclosure popover holding the
// thread controls. This declutters the reading surface (Steve Krug; Dieter
// Rams) and reclaims the strip's flow height for the answer, while keeping the
// existing handlers, testids, aria-live announcer, and the "lease preserved"
// reassurance intact (Don Norman: signal safety up front; the control lives
// with the thread it acts on).

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatUI } from './ChatUI';
import { withChatStream } from './test-helpers';

const THREAD = [
  { id: 'm1', role: 'user' as const, content: 'Hello there assistant' },
];

function renderWithThread() {
  return render(
    withChatStream(
      <ChatUI
        workspaceName="Demo"
        initialMessages={THREAD}
        conversationId="c1"
      />,
    ),
  );
}

afterEach(cleanup);

describe('Sprint 52.2 — chat-thread overflow menu', () => {
  it('hides the thread controls behind a slim overflow trigger (menu closed by default)', () => {
    renderWithThread();
    const trigger = screen.getByTestId('assistant-thread-menu-trigger');
    // Disclosure semantics: a labelled button that owns a popup, collapsed.
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger.getAttribute('aria-label') ?? '').toMatch(
      /option|menu|more/i,
    );
    // ≥44px touch target (house WCAG baseline, like the close/expand buttons).
    expect(trigger.className).toMatch(/\bh-11\b/);
    expect(trigger.className).toMatch(/\bw-11\b/);
    // The popover is present in the DOM but visually collapsed until opened.
    expect(screen.getByTestId('assistant-thread-menu')).toHaveClass('hidden');
  });

  it('reclaims the strip: the toolbar anchor adds no flow height (no py block, no border-b)', () => {
    renderWithThread();
    const toolbar = screen.getByTestId('conversation-toolbar');
    // Was a padded, bordered ~32px strip above the transcript; now a 0-height
    // relative anchor for the floating trigger (Wathan/Schoger: spacing, not a
    // persistent fenced band).
    expect(toolbar.className).not.toContain('py-1.5');
    expect(toolbar.className).not.toContain('border-b');
    expect(toolbar.className).toContain('relative');
  });

  it('clicking the trigger opens the menu and reveals "Clear assistant chat" with its safety note', () => {
    renderWithThread();
    fireEvent.click(screen.getByTestId('assistant-thread-menu-trigger'));
    expect(screen.getByTestId('assistant-thread-menu-trigger')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const menu = screen.getByTestId('assistant-thread-menu');
    expect(menu).not.toHaveClass('hidden');
    const clear = screen.getByTestId('new-conversation-btn');
    expect(menu.contains(clear)).toBe(true);
    // The "your lease will stay here" reassurance rides along, and the button
    // is described by it (no longer hidden on mobile).
    const helper = screen.getByTestId('clear-assistant-chat-helper');
    expect(menu.contains(helper)).toBe(true);
    expect(clear.getAttribute('aria-describedby')).toBe(helper.id);
  });

  it('Escape closes the menu', () => {
    renderWithThread();
    const trigger = screen.getByTestId('assistant-thread-menu-trigger');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(screen.getByTestId('assistant-thread-menu'), {
      key: 'Escape',
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('assistant-thread-menu')).toHaveClass('hidden');
  });

  it('Sprint 52.5 — portals the trigger + menu into the provided header container (no floating overlap over the transcript)', () => {
    // Fix for the workspace-drawer overlap: instead of floating the ⋯ over the
    // scrollable transcript, the FAB hands ChatUI a header slot and the menu
    // renders THERE (next to Expand/Close). The in-grid `conversation-toolbar`
    // stays as a 0-height grid placeholder; the trigger is a normal flex child,
    // not an absolutely-positioned overlay.
    const container = document.createElement('div');
    document.body.appendChild(container);
    try {
      render(
        withChatStream(
          <ChatUI
            workspaceName="Demo"
            initialMessages={THREAD}
            conversationId="c1"
            threadMenuContainer={container}
          />,
        ),
      );
      const trigger = screen.getByTestId('assistant-thread-menu-trigger');
      // Rendered into the header slot, not ChatUI's own transcript column.
      expect(container.contains(trigger)).toBe(true);
      expect(screen.getByTestId('conversation-toolbar').contains(trigger)).toBe(
        false,
      );
      // No longer a floating overlay (the root cause of the overlap).
      expect(trigger.className).not.toContain('absolute');
      expect(trigger.className).not.toContain('z-overlay');
    } finally {
      container.remove();
    }
  });

  it('without a container, the menu still renders in place (non-FAB / legacy mounts)', () => {
    renderWithThread();
    const trigger = screen.getByTestId('assistant-thread-menu-trigger');
    expect(screen.getByTestId('conversation-toolbar').contains(trigger)).toBe(
      true,
    );
  });

  it('selecting "Clear assistant chat" from the menu clears the thread, announces preservation, and closes the menu', async () => {
    renderWithThread();
    expect(screen.getByText('Hello there assistant')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('assistant-thread-menu-trigger'));
    fireEvent.click(screen.getByTestId('new-conversation-btn'));
    const announcer = await screen.findByTestId('new-conversation-announcer');
    expect(announcer.textContent ?? '').toMatch(/chat cleared.*preserved/i);
    // The thread is gone but the menu has closed itself.
    expect(screen.queryByText('Hello there assistant')).not.toBeInTheDocument();
    expect(screen.getByTestId('assistant-thread-menu-trigger')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });
});
