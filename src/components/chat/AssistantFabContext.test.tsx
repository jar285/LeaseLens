// Sprint 26c Phase 1 — red test.
//
// State machine + selection context for the assistant FAB. Mirrors
// ChatStreamContext's pattern: throws when consumed outside its
// provider; consumers call setters via the hook.

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AssistantFabProvider,
  type AssistantFabState,
  useAssistantFab,
} from './AssistantFabContext';

afterEach(() => {
  cleanup();
});

// Probe component that captures the current context value across renders.
function spyContext(): {
  current: ReturnType<typeof useAssistantFab> | null;
} {
  const ref: { current: ReturnType<typeof useAssistantFab> | null } = {
    current: null,
  };
  function Probe(): null {
    ref.current = useAssistantFab();
    return null;
  }
  render(
    <AssistantFabProvider>
      <Probe />
    </AssistantFabProvider>,
  );
  return ref;
}

describe('AssistantFabContext', () => {
  it('starts in the closed state with no pending prompt or selection', () => {
    const ctx = spyContext();
    expect(ctx.current).not.toBeNull();
    expect(ctx.current?.state).toBe<AssistantFabState>('closed');
    expect(ctx.current?.pendingPrompt).toBeNull();
    expect(ctx.current?.selection.clauseId).toBeNull();
    expect(ctx.current?.selection.severity).toBeUndefined();
    expect(ctx.current?.selection.statuteCitation).toBeUndefined();
  });

  it('openMenu transitions to the menu state', () => {
    const ctx = spyContext();
    act(() => {
      ctx.current?.openMenu();
    });
    expect(ctx.current?.state).toBe<AssistantFabState>('menu');
  });

  it('openWith jumps directly to the drawer state and stores the prompt + selection', () => {
    const ctx = spyContext();
    act(() => {
      ctx.current?.openWith({
        initialPrompt: 'Explain clause §3',
        clauseId: 'clause-1',
        severity: 'high',
        statuteCitation: 'NJ Stat 46:8-19',
      });
    });
    expect(ctx.current?.state).toBe<AssistantFabState>('drawer');
    expect(ctx.current?.pendingPrompt).toBe('Explain clause §3');
    expect(ctx.current?.selection.clauseId).toBe('clause-1');
    expect(ctx.current?.selection.severity).toBe('high');
    expect(ctx.current?.selection.statuteCitation).toBe('NJ Stat 46:8-19');
  });

  it('openWith without optional selection fields still works', () => {
    const ctx = spyContext();
    act(() => {
      ctx.current?.openWith({ initialPrompt: 'Just open chat' });
    });
    expect(ctx.current?.state).toBe<AssistantFabState>('drawer');
    expect(ctx.current?.pendingPrompt).toBe('Just open chat');
    expect(ctx.current?.selection.clauseId).toBeNull();
    expect(ctx.current?.selection.severity).toBeUndefined();
  });

  it('openDrawer (no prefill) transitions to drawer without setting pendingPrompt', () => {
    const ctx = spyContext();
    act(() => {
      ctx.current?.openDrawer();
    });
    expect(ctx.current?.state).toBe<AssistantFabState>('drawer');
    expect(ctx.current?.pendingPrompt).toBeNull();
  });

  it('close returns to closed but preserves pendingPrompt + selection so reopening restores context', () => {
    // Sprint 27 — close() is now a "hide" action; it must not erase
    // the user's draft (pendingPrompt) or the clause they were
    // looking at (selection). Reopening the FAB should bring the
    // user back to where they were.
    const ctx = spyContext();
    act(() => {
      ctx.current?.openWith({
        initialPrompt: 'Hello',
        clauseId: 'c1',
        severity: 'medium',
        statuteCitation: 'NJ Stat 46:8-19',
      });
    });
    expect(ctx.current?.state).toBe<AssistantFabState>('drawer');

    act(() => {
      ctx.current?.close();
    });
    expect(ctx.current?.state).toBe<AssistantFabState>('closed');
    expect(ctx.current?.pendingPrompt).toBe('Hello');
    expect(ctx.current?.selection.clauseId).toBe('c1');
    expect(ctx.current?.selection.severity).toBe('medium');
    expect(ctx.current?.selection.statuteCitation).toBe('NJ Stat 46:8-19');
  });

  it('clearContext fully resets state, pendingPrompt and selection', () => {
    // Sprint 27 — callers that want the old reset-on-close behavior
    // (e.g. "New conversation") use clearContext() explicitly.
    const ctx = spyContext();
    act(() => {
      ctx.current?.openWith({
        initialPrompt: 'Hello',
        clauseId: 'c1',
        severity: 'medium',
      });
    });

    act(() => {
      ctx.current?.clearContext();
    });
    expect(ctx.current?.state).toBe<AssistantFabState>('closed');
    expect(ctx.current?.pendingPrompt).toBeNull();
    expect(ctx.current?.selection.clauseId).toBeNull();
    expect(ctx.current?.selection.severity).toBeUndefined();
    expect(ctx.current?.selection.statuteCitation).toBeUndefined();
  });

  it('throws when useAssistantFab is consumed outside the provider', () => {
    // Swallow the React error logs that come along for the ride.
    const originalError = console.error;
    console.error = () => {};
    try {
      function Probe(): null {
        useAssistantFab();
        return null;
      }
      expect(() => render(<Probe />)).toThrow(/AssistantFabProvider/);
    } finally {
      console.error = originalError;
    }
  });
});
