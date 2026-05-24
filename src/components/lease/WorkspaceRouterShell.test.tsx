// Sprint 26a Phase 4 — red test.
//
// Pure client-side switch between Mode A (ParserLandingShell) and Mode B
// (LeaseLensWorkspaceShell). The decision is based on initialActiveLease:
// null → landing; non-null → legacy three-pane shell (until Sprint 26b
// replaces it with ParserResultsShell).
//
// We mock LeaseLensWorkspaceShell to keep this test focused on the router
// decision. The real shell pulls in react-pdf + IndexedDB lookups which
// are not the subject of this test.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Sprint 26b — post-upload branch routes to ParserResultsShell, not the
// legacy three-pane LeaseLensWorkspaceShell. Mock the new shell to keep
// the router test focused on the routing decision + prop forwarding.
// The mock surfaces a Replace button that fires onReplace so the
// "back to Mode A" path is observable.
vi.mock('./ParserResultsShell', () => ({
  ParserResultsShell: (props: {
    workspaceName: string;
    conversationId?: string | null;
    onReplace?: () => void;
  }) => (
    <div
      data-testid="parser-results-shell"
      data-workspace-name={String(props.workspaceName)}
      data-conversation-id={String(props.conversationId ?? '')}
    >
      <button
        type="button"
        data-testid="results-replace-button"
        onClick={() => props.onReplace?.()}
      >
        Replace
      </button>
    </div>
  ),
}));

// Keep the legacy shell mocked so the upload-lift test (which still
// references `shell-root` as the post-upload observable in 26a) keeps
// working. Sprint 26b updates the lift test to assert
// `parser-results-shell` instead.
vi.mock('./LeaseLensWorkspaceShell', () => ({
  LeaseLensWorkspaceShell: () => (
    <div data-testid="shell-root">legacy three-pane shell</div>
  ),
}));

import { WorkspaceRouterShell } from './WorkspaceRouterShell';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WorkspaceRouterShell', () => {
  it('renders the ParserLandingShell when initialActiveLease is null', () => {
    render(
      <WorkspaceRouterShell
        workspaceName="Demo workspace"
        conversationId={null}
        initialMessages={[]}
        initialToolEvents={[]}
        initialActiveLease={null}
      />,
    );
    expect(screen.getByTestId('parser-landing-shell')).toBeInTheDocument();
    expect(screen.queryByTestId('shell-root')).not.toBeInTheDocument();
  });

  it('renders the ParserResultsShell when initialActiveLease is provided', () => {
    render(
      <WorkspaceRouterShell
        workspaceName="Demo workspace"
        conversationId="conv-1"
        initialMessages={[]}
        initialToolEvents={[]}
        initialActiveLease={{
          lease_id: 'lease-1',
          filename: 'sample.pdf',
          page_count: 3,
          clause_count: 5,
        }}
      />,
    );
    expect(screen.getByTestId('parser-results-shell')).toBeInTheDocument();
    expect(
      screen.queryByTestId('parser-landing-shell'),
    ).not.toBeInTheDocument();
  });

  it('forwards workspaceName and conversationId to the results shell', () => {
    render(
      <WorkspaceRouterShell
        workspaceName="Studio acme"
        conversationId="conv-42"
        initialMessages={[]}
        initialToolEvents={[]}
        initialActiveLease={{
          lease_id: 'lease-2',
          filename: 'lease.pdf',
        }}
      />,
    );
    const root = screen.getByTestId('parser-results-shell');
    expect(root).toHaveAttribute('data-workspace-name', 'Studio acme');
    expect(root).toHaveAttribute('data-conversation-id', 'conv-42');
  });

  it('treats initialActiveLease undefined the same as null (landing path)', () => {
    render(
      <WorkspaceRouterShell
        workspaceName="Demo"
        conversationId={null}
        initialMessages={[]}
        initialToolEvents={[]}
      />,
    );
    expect(screen.getByTestId('parser-landing-shell')).toBeInTheDocument();
  });

  it('lifts to Mode B in-memory when the Mode A dropzone reports a successful upload', async () => {
    // Sprint 26a — the router shell holds local state so an in-session
    // upload from Mode A transitions to Mode B without a hard refresh.
    // The Mode A dropzone forwards `(UploadResult, File)` via onUploaded;
    // the router converts it into an ActiveLeaseRef and switches branches.
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        lease_id: 'lease-router-test',
        page_count: 2,
        clause_count: 4,
      }),
    } as unknown as Response);
    vi.stubGlobal('fetch', fetchStub);
    // happy-dom doesn't provide URL.createObjectURL by default — supply a
    // minimal stub so the router shell's createObjectURL call doesn't
    // throw before the state lift.
    const originalURL = globalThis.URL;
    Object.defineProperty(globalThis.URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(() => 'blob:mock-router-test'),
    });
    Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });

    render(
      <WorkspaceRouterShell
        workspaceName="Demo"
        conversationId={null}
        initialMessages={[]}
        initialToolEvents={[]}
        initialActiveLease={null}
      />,
    );

    expect(screen.getByTestId('parser-landing-shell')).toBeInTheDocument();

    const file = new File([new Uint8Array(8)], 'lease.pdf', {
      type: 'application/pdf',
    });
    const input = screen.getByTestId('lease-upload-input') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    // After the upload promise resolves, the router lifts state and the
    // ParserResultsShell (mocked above) takes over.
    await screen.findByTestId('parser-results-shell');
    expect(
      screen.queryByTestId('parser-landing-shell'),
    ).not.toBeInTheDocument();

    void originalURL; // satisfy `noUnusedLocals` while preserving intent
  });

  it('returns to Mode A when ParserResultsShell fires onReplace', () => {
    // Sprint 26b — Replace inside the results shell must clear the
    // router's liveActiveLease so the user returns to the landing.
    // The top-level ParserResultsShell mock exposes a results-replace
    // button that fires the onReplace prop.
    render(
      <WorkspaceRouterShell
        workspaceName="Demo"
        conversationId={null}
        initialMessages={[]}
        initialToolEvents={[]}
        initialActiveLease={{ lease_id: 'lease-replace', filename: 'a.pdf' }}
      />,
    );

    expect(screen.getByTestId('parser-results-shell')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('results-replace-button'));
    expect(screen.getByTestId('parser-landing-shell')).toBeInTheDocument();
    expect(
      screen.queryByTestId('parser-results-shell'),
    ).not.toBeInTheDocument();
  });
});
