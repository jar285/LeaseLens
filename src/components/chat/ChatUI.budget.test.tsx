// Sprint D.12b (#12) — typed budget/at-limit dispatch in ChatUI.
//
// Two failure transports must render CALMLY (Michael Nygard / Google SRE:
// graceful degradation — only the AI dependency is paused, the parsed lease +
// red flags remain usable):
//   1. the daily spend ceiling arrives as a typed {budget:{scope:'daily'}}
//      NDJSON event on a 200 stream (was: a demo-copy {chunk} rendered as a
//      fake assistant message);
//   2. the per-visitor rate limit arrives as an HTTP 429 (was: thrown into the
//      generic red "Failed to generate response" banner — the frame-04 bug).
// The polished QuotaMeter rendering lands in Phase C; this pins the dispatch
// contract + the calm plain notice.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatUI } from './ChatUI';
import { withChatStream } from './test-helpers';

function ndjsonStream(lines: unknown[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      }
      controller.close();
    },
  });
}

function renderChat() {
  return render(
    withChatStream(
      <ChatUI workspaceName="Demo" initialMessages={[]} conversationId="c1" />,
    ),
  );
}

async function submitMessage(text: string) {
  const box = screen.getByRole('textbox');
  fireEvent.change(box, { target: { value: text } });
  // The composer has no <form>; submission is the "Send message" button.
  const send = screen
    .getAllByLabelText('Send message')
    .find((b) => !b.hasAttribute('disabled'));
  if (!send) throw new Error('enabled send button not found');
  fireEvent.click(send);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Sprint D.12b — typed budget event (daily ceiling)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: ndjsonStream([
          { budget: { scope: 'daily', requestId: 'REQ-1' } },
        ]),
      } as unknown as Response),
    );
  });

  it('renders a calm paused notice — not an error, not a chat bubble', async () => {
    renderChat();
    await submitMessage('Is my late fee legal?');

    const notice = await screen.findByTestId('budget-notice');
    // Calm graceful-degradation copy: names the pause + what still works.
    expect(notice.textContent).toMatch(/paused for today/i);
    expect(notice.textContent).toMatch(/lease review/i);
    // SR-visible as a status, not an alert (calm, non-interruptive).
    expect(notice).toHaveAttribute('role', 'status');
    // The scary generic banner must NOT render.
    expect(screen.queryByText('Failed to generate response')).toBeNull();
    // The retired demo copy must never reappear.
    expect(screen.queryByText(/Daily demo quota reached/i)).toBeNull();
    // No dangling empty assistant bubble from the aborted turn.
    const transcript = screen.queryAllByTestId('chat-message-assistant');
    for (const m of transcript) {
      expect(m.textContent?.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('Sprint D.12b — 429 rate-limit renders calmly (frame-04 fix)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '1800' }),
        json: async () => ({
          error: 'Too many requests — please slow down.',
          code: 'RATE_LIMITED',
        }),
        body: null,
      } as unknown as Response),
    );
  });

  it('renders the rate-limit notice instead of the generic error banner', async () => {
    renderChat();
    await submitMessage('And my security deposit?');

    const notice = await screen.findByTestId('budget-notice');
    expect(notice.textContent).toMatch(/question limit/i);
    expect(notice.textContent).toMatch(/resets/i);
    expect(notice.textContent).toMatch(/lease review/i);
    expect(screen.queryByText('Failed to generate response')).toBeNull();
  });

  it('a later successful turn clears the notice', async () => {
    renderChat();
    await submitMessage('first — hits the limit');
    await screen.findByTestId('budget-notice');

    // Window freed: next turn streams normally.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: ndjsonStream([
          { conversationId: 'c1' },
          { chunk: 'Here is your answer.' },
        ]),
      } as unknown as Response),
    );
    await submitMessage('second — succeeds');
    await waitFor(() =>
      expect(screen.queryByTestId('budget-notice')).toBeNull(),
    );
  });
});
