// Sprint D.17ui (#17, #25) — ChatUI wiring for the QuotaMeter.
//
// The widened {quota:{remaining,limit}} stream event drives the progressive
// meter in the footer, and crossing the low threshold is announced ONCE via
// the shared polite live region (announcing every decrement would spam SR
// users — WCAG: informative, not chatty). The legacy raw-amber "Demo quota"
// banner is retired in favour of the tokenized meter.

import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

function stubTurn(lines: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: ndjsonStream(lines),
    } as unknown as Response),
  );
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

describe('Sprint D.17ui — quota meter wiring', () => {
  it('a low widened quota event renders the meter with count + progressbar', async () => {
    stubTurn([
      { quota: { remaining: 24, limit: 60 } },
      { conversationId: 'c1' },
      { chunk: 'Answer.' },
    ]);
    renderChat();
    await submitMessage('Is my late fee legal?');

    const meter = await screen.findByTestId('quota-meter');
    expect(meter.textContent).toMatch(/24 questions left this hour/i);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '24',
    );
    // The retired raw-amber banner copy never renders.
    expect(screen.queryByText(/Demo quota:/i)).toBeNull();
  });

  it('an ample quota event renders no meter', async () => {
    stubTurn([
      { quota: { remaining: 55, limit: 60 } },
      { conversationId: 'c1' },
      { chunk: 'Answer.' },
    ]);
    renderChat();
    await submitMessage('hello');
    await waitFor(() => expect(screen.queryByText(/Answer\./)).not.toBeNull());
    expect(screen.queryByTestId('quota-meter')).toBeNull();
  });

  it('announces the low crossing once — not again on the next decrement', async () => {
    stubTurn([
      { quota: { remaining: 24, limit: 60 } },
      { conversationId: 'c1' },
      { chunk: 'First.' },
    ]);
    renderChat();
    await submitMessage('turn one');
    await screen.findByTestId('quota-meter');

    const announcer = screen.getByTestId('new-conversation-announcer');
    await waitFor(() =>
      expect(announcer.textContent).toMatch(/24 questions left this hour/i),
    );

    // Next turn drains one more — still low, must NOT re-announce.
    stubTurn([
      { quota: { remaining: 23, limit: 60 } },
      { conversationId: 'c1' },
      { chunk: 'Second.' },
    ]);
    await submitMessage('turn two');
    await waitFor(() =>
      expect(screen.getByTestId('quota-meter').textContent).toMatch(
        /23 questions/i,
      ),
    );
    expect(announcer.textContent).not.toMatch(/23 questions/i);
  });
});
