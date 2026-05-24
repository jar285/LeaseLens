// Sprint 26c Phase 6 — integration test.
//
// Drives the full FAB → ChatUI → ChatComposer flow with the real
// AssistantFabContext + AssistantFabClient. Stubs ChatUI's fetch so
// the NDJSON stream resolves deterministically without hitting the
// network; verifies that openWith pre-fills the composer and that
// submitting the seeded prompt forwards the right body to /api/chat.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantFabClient } from './AssistantFab.client';
import { AssistantFabProvider, useAssistantFab } from './AssistantFabContext';
import { ChatStreamProvider } from './ChatStreamContext';

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // Stub the NDJSON streamer with a single tail-chunk so ChatUI's
  // stream reader resolves immediately. We don't assert on the
  // assistant reply itself — only that the request body carried the
  // seeded prompt as the user message.
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          JSON.stringify({
            conversationId: 'conv-int',
          }) + '\n',
        ),
      );
      controller.close();
    },
  });
  fetchSpy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body,
  } as unknown as Response);
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AssistantFab integration', () => {
  it('openWith seeds the composer + submitting posts the prompt to /api/chat', async () => {
    // Capture the FAB context handle via a mutable ref-style holder.
    // A `let` binding gets narrowed to `null` by TS because it can't
    // see the inner-component assignment; the holder dodges that.
    const holder: { fab: ReturnType<typeof useAssistantFab> | null } = {
      fab: null,
    };
    function Probe(): null {
      holder.fab = useAssistantFab();
      return null;
    }

    render(
      <AssistantFabProvider>
        <ChatStreamProvider viewerRole="Tenant">
          <Probe />
          <AssistantFabClient
            workspaceName="Demo workspace"
            conversationId={null}
            initialMessages={[]}
          />
        </ChatStreamProvider>
      </AssistantFabProvider>,
    );

    // Open the drawer with a seeded prompt — mirrors what
    // RedFlagReport's Explain button does in production.
    act(() => {
      holder.fab?.openWith({ initialPrompt: 'Explain clause §3.' });
    });

    const drawer = await screen.findByTestId('assistant-fab-drawer');
    expect(drawer).toBeInTheDocument();

    // The composer's textarea picks up the prefill.
    const textarea = await screen.findByLabelText('Type a message');
    expect((textarea as HTMLTextAreaElement).value).toBe('Explain clause §3.');

    // Hit Enter to submit. ChatUI fires fetch('/api/chat', { ... }).
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    // Inspect the request body: the seeded prompt should be the
    // outgoing user message.
    const [url, init] = fetchSpy.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(String(url)).toMatch(/\/api\/chat$/);
    const sent = JSON.parse(String(init?.body ?? '{}')) as {
      message?: string;
    };
    expect(sent.message).toBe('Explain clause §3.');
  });

  it('typed draft survives a close→open cycle', async () => {
    // Sprint 27 — acceptance criterion: closing the FAB must not
    // delete an unsent draft. The user types a prefill + extra text,
    // closes, and reopens; the textarea retains everything.
    const holder: { fab: ReturnType<typeof useAssistantFab> | null } = {
      fab: null,
    };
    function Probe(): null {
      holder.fab = useAssistantFab();
      return null;
    }

    render(
      <AssistantFabProvider>
        <ChatStreamProvider viewerRole="Tenant">
          <Probe />
          <AssistantFabClient
            workspaceName="Demo workspace"
            conversationId={null}
            initialMessages={[]}
          />
        </ChatStreamProvider>
      </AssistantFabProvider>,
    );

    act(() => {
      holder.fab?.openWith({ initialPrompt: 'Explain clause §3.' });
    });
    const textarea = (await screen.findByLabelText(
      'Type a message',
    )) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Explain clause §3.');

    // User appends a question to the prefill.
    fireEvent.change(textarea, {
      target: { value: 'Explain clause §3. Also §5?' },
    });
    expect(textarea.value).toBe('Explain clause §3. Also §5?');

    // Close the FAB. State should go to closed but the drawer DOM
    // and the composer state must persist.
    fireEvent.click(screen.getByTestId('assistant-fab-close'));
    expect(holder.fab?.state).toBe('closed');

    // Reopen via openDrawer (no new prefill).
    act(() => {
      holder.fab?.openDrawer();
    });

    // Same textarea node, same value.
    const textareaAfter = (await screen.findByLabelText(
      'Type a message',
    )) as HTMLTextAreaElement;
    expect(textareaAfter.value).toBe('Explain clause §3. Also §5?');
  });

  it('clause selection context survives close→open', () => {
    // Sprint 27 — when the user clicks "Explain this clause" on a
    // red-flag card, AssistantFabContext stores the clauseId so the
    // chip set knows what's selected. That selection must outlive
    // a close→open cycle.
    const holder: { fab: ReturnType<typeof useAssistantFab> | null } = {
      fab: null,
    };
    function Probe(): null {
      holder.fab = useAssistantFab();
      return null;
    }

    render(
      <AssistantFabProvider>
        <ChatStreamProvider viewerRole="Tenant">
          <Probe />
          <AssistantFabClient
            workspaceName="Demo workspace"
            conversationId={null}
            initialMessages={[]}
          />
        </ChatStreamProvider>
      </AssistantFabProvider>,
    );

    act(() => {
      holder.fab?.openWith({
        initialPrompt: 'Explain clause §3.',
        clauseId: 'clause-3',
        severity: 'high',
        statuteCitation: 'NJ Stat 46:8-19',
      });
    });
    expect(holder.fab?.selection.clauseId).toBe('clause-3');

    fireEvent.click(screen.getByTestId('assistant-fab-close'));
    expect(holder.fab?.state).toBe('closed');
    expect(holder.fab?.selection.clauseId).toBe('clause-3');
    expect(holder.fab?.selection.severity).toBe('high');
    expect(holder.fab?.selection.statuteCitation).toBe('NJ Stat 46:8-19');

    act(() => {
      holder.fab?.openDrawer();
    });
    expect(holder.fab?.selection.clauseId).toBe('clause-3');
  });
});
