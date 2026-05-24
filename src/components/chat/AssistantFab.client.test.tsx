// Sprint 26c Phase 3 — red test.
//
// The real FAB. Reads from AssistantFabContext to decide what to render
// (pill / menu / drawer). Mocks ChatUI so the test focuses on the FAB's
// own composition + a11y semantics, not the chat stream itself.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantFabProvider, useAssistantFab } from './AssistantFabContext';
import { ChatStreamProvider } from './ChatStreamContext';

// Sprint 27.1 — the ChatUI mock now surfaces the new `suggestedPrompts`
// + `onSelectSuggestion` props so the FAB-level unit tests can assert
// that the FAB wires its quick-action chips into the drawer correctly
// without rendering the full ChatUI tree. Integration tests
// (AssistantFab.integration.test.tsx) cover the end-to-end behavior
// with the real ChatUI.
vi.mock('./ChatUI', () => ({
  ChatUI: (props: {
    initialComposerText?: string;
    suggestedPrompts?: Array<{
      id: string;
      label: string;
      prompt: string;
      disabled?: boolean;
    }>;
    onSelectSuggestion?: (prompt: string) => void;
  }) => (
    <div
      data-testid="chat-ui-mock"
      data-prefill={props.initialComposerText ?? ''}
    >
      ChatUI mock
      {props.suggestedPrompts?.map((s) => (
        <button
          key={s.id}
          type="button"
          data-testid="chat-ui-mock-suggestion"
          data-suggestion-id={s.id}
          disabled={s.disabled}
          onClick={() => props.onSelectSuggestion?.(s.prompt)}
        >
          {s.label}
        </button>
      ))}
    </div>
  ),
}));

import { AssistantFabClient } from './AssistantFab.client';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Helper that renders the FAB inside both providers it needs and
// exposes the FAB context handle for test-side state pokes.
function renderFab(): {
  fab: ReturnType<typeof useAssistantFab> | null;
} {
  const ref: { fab: ReturnType<typeof useAssistantFab> | null } = {
    fab: null,
  };
  function Spy(): null {
    ref.fab = useAssistantFab();
    return null;
  }
  render(
    <AssistantFabProvider>
      <ChatStreamProvider viewerRole="Tenant">
        <Spy />
        <AssistantFabClient
          workspaceName="Demo"
          conversationId={null}
          initialMessages={[]}
        />
      </ChatStreamProvider>
    </AssistantFabProvider>,
  );
  return ref;
}

describe('AssistantFabClient', () => {
  it('renders only the closed pill when state is "closed"', () => {
    renderFab();
    const pill = screen.getByTestId('assistant-fab');
    expect(pill).toBeInTheDocument();
    expect(pill.tagName).toBe('BUTTON');
    expect(pill).toHaveAttribute('aria-label', 'Open assistant');
    expect(pill).toHaveAttribute('type', 'button');
    expect(screen.queryByTestId('assistant-fab-menu')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('assistant-fab-drawer'),
    ).not.toBeInTheDocument();
  });

  it('clicking the pill opens the drawer directly (no menu gate)', () => {
    // Sprint 27.1 — the menu popup is removed. Click → drawer with
    // an empty composer; quick actions migrate inside the drawer as
    // suggestion chips. The legacy menu testid must not appear.
    //
    // NOTE: we read `ctx.fab` (not a destructured `fab`) because the
    // context value is recreated by useMemo on each state change. A
    // captured destructure points to the stale pre-click value; the
    // ref holder always exposes the latest.
    const ctx = renderFab();
    fireEvent.click(screen.getByTestId('assistant-fab'));
    expect(ctx.fab?.state).toBe('drawer');
    expect(screen.getByTestId('assistant-fab-drawer')).toBeInTheDocument();
    expect(screen.queryByTestId('assistant-fab-menu')).not.toBeInTheDocument();
    // No prefill text — the composer opens blank.
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('');
  });

  it('passes quick-action chips into the drawer as suggested prompts', () => {
    // Sprint 27.1 — the four CHIPS that used to live in the menu popup
    // are now passed to ChatUI as `suggestedPrompts`. We assert the
    // count + that the always-enabled "citation" chip is present and
    // not disabled.
    renderFab();
    fireEvent.click(screen.getByTestId('assistant-fab'));
    const suggestions = screen.getAllByTestId('chat-ui-mock-suggestion');
    expect(suggestions).toHaveLength(4);
    const citationChip = suggestions.find(
      (s) => s.getAttribute('data-suggestion-id') === 'understand-citation',
    );
    expect(citationChip).toBeDefined();
    expect(citationChip).not.toBeDisabled();
  });

  it("clicking an in-drawer suggestion chip seeds the composer with that chip's prompt", () => {
    // Sprint 27.1 — equivalent to the old "chip opens drawer with
    // prefill" test, but the chip now lives inside the open drawer
    // rather than in a separate popup menu.
    renderFab();
    fireEvent.click(screen.getByTestId('assistant-fab'));
    const citationChip = screen
      .getAllByTestId('chat-ui-mock-suggestion')
      .find(
        (s) => s.getAttribute('data-suggestion-id') === 'understand-citation',
      );
    if (!citationChip) throw new Error('expected citation suggestion chip');
    fireEvent.click(citationChip);
    expect(screen.getByTestId('assistant-fab-drawer')).toBeInTheDocument();
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toMatch(/citation/i);
  });

  it('calling openWith from context jumps directly to the drawer with the supplied prompt', () => {
    const { fab } = renderFab();
    act(() => {
      fab?.openWith({ initialPrompt: 'Custom seeded prompt' });
    });
    expect(screen.getByTestId('assistant-fab-drawer')).toBeInTheDocument();
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('Custom seeded prompt');
  });

  it('renders the drawer as aria-modal with a labelled heading', () => {
    const { fab } = renderFab();
    act(() => {
      fab?.openDrawer();
    });
    const drawer = screen.getByTestId('assistant-fab-drawer');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    const labelledBy = drawer.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy!);
    expect(heading).not.toBeNull();
    expect(heading?.textContent?.toLowerCase()).toContain('assistant');
  });

  it('does not emit a React 19 boolean-attribute warning for inert when closing the drawer', () => {
    // Sprint 27.1 — React 19 rejects `inert=""` (empty-string idiom).
    // Both `inert=""` and `inert={true}` serialize to the same DOM
    // attribute, so a DOM-only assertion can't catch this regression.
    // We spy on console.error (React fires the warning there) and
    // assert no inert-related warning fires during a full open→close
    // cycle. The hasAttribute check below is a secondary sanity probe.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { fab } = renderFab();
      act(() => {
        fab?.openDrawer();
      });
      const drawerOpen = screen.getByTestId('assistant-fab-drawer');
      expect(drawerOpen.hasAttribute('inert')).toBe(false);

      fireEvent.click(screen.getByTestId('assistant-fab-close'));
      const drawerClosed = screen.getByTestId('assistant-fab-drawer');
      expect(drawerClosed.hasAttribute('inert')).toBe(true);

      const inertWarnings = errorSpy.mock.calls.filter((args) => {
        const msg = String(args[0] ?? '');
        return (
          msg.includes('boolean attribute') &&
          msg.toLowerCase().includes('inert')
        );
      });
      expect(inertWarnings).toHaveLength(0);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('clicking the drawer close button hides the drawer but keeps it mounted so chat state survives', () => {
    // Sprint 27 — close() now hides the drawer instead of unmounting
    // it. The DOM node persists so ChatUI's transcript and composer
    // draft survive a close→open cycle. We assert the FAB state
    // transitions to "closed" and the drawer is aria-hidden + hidden,
    // but still present in the DOM.
    const { fab } = renderFab();
    act(() => {
      fab?.openDrawer();
    });
    const drawerOpen = screen.getByTestId('assistant-fab-drawer');
    expect(drawerOpen).toBeInTheDocument();
    expect(drawerOpen).not.toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByTestId('assistant-fab-close'));

    const drawerClosed = screen.getByTestId('assistant-fab-drawer');
    expect(drawerClosed).toBeInTheDocument();
    expect(drawerClosed).toHaveAttribute('aria-hidden', 'true');
    expect(drawerClosed).toHaveAttribute('data-state', 'closed');
    expect(fab?.state).toBe('closed');
    expect(screen.getByTestId('assistant-fab')).toBeInTheDocument();
  });

  it('Escape on the drawer hides it (state goes to closed, DOM persists)', () => {
    const { fab } = renderFab();
    act(() => {
      fab?.openDrawer();
    });
    const drawer = screen.getByTestId('assistant-fab-drawer');
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(fab?.state).toBe('closed');
    expect(screen.getByTestId('assistant-fab-drawer')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('drawer does not mount before first open (lazy mount)', () => {
    // Don't open the drawer at all; only the pill renders.
    renderFab();
    expect(screen.getByTestId('assistant-fab')).toBeInTheDocument();
    expect(
      screen.queryByTestId('assistant-fab-drawer'),
    ).not.toBeInTheDocument();
  });

  it('reopening the drawer after close keeps the same ChatUI instance and prefill', () => {
    // Sprint 27 — the drawer should not remount on reopen. We use the
    // ChatUI mock's data-prefill attribute as a coarse proxy for
    // "same instance"; since we don't re-key on pendingPrompt, the
    // prefill stays addressable across cycles.
    const { fab } = renderFab();
    act(() => {
      fab?.openWith({ initialPrompt: 'First open prefill' });
    });
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('First open prefill');

    fireEvent.click(screen.getByTestId('assistant-fab-close'));
    // Drawer hidden but still mounted; prefill still readable.
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('First open prefill');

    act(() => {
      fab?.openDrawer();
    });
    expect(screen.getByTestId('assistant-fab-drawer')).toHaveAttribute(
      'data-state',
      'drawer',
    );
    expect(
      screen.getByTestId('chat-ui-mock').getAttribute('data-prefill'),
    ).toBe('First open prefill');
  });

  it('disables the "Explain this clause" suggestion when no clause is selected', () => {
    // Sprint 27.1 — same gating logic, new surface. The chip is now
    // a suggestedPrompts entry inside the drawer; it's marked disabled
    // when ChatStreamContext has no activeClauseId.
    renderFab();
    fireEvent.click(screen.getByTestId('assistant-fab'));
    const explainChip = screen
      .getAllByTestId('chat-ui-mock-suggestion')
      .find((s) => s.getAttribute('data-suggestion-id') === 'explain-clause');
    expect(explainChip).toBeDefined();
    expect(explainChip).toBeDisabled();
  });
});
