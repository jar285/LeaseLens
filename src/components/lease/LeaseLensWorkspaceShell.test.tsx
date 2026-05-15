// Sprint 13 §3f / Phase 10 — three-pane client shell.
//
// Wraps ChatStreamProvider, mounts PdfViewer (or LeaseUploadDropzone)
// in the left pane, ChatUI in the middle, RedFlagReport in the right.
// Forwards ChatUI tool_result events into ChatStreamContext so the
// right pane fills in progressively.
//
// Tests stub PdfViewer + ChatUI so we can exercise the shell's wiring
// without dragging the streaming chat / Worker stack into the unit
// suite.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type PdfBinaryRepository,
  setPdfBinaryRepository,
} from '@/lib/lease/pdf-binary-repository';

// Stub the heavy children so we can assert on the shell's wiring.
vi.mock('@/components/lease/PdfViewer', () => ({
  PdfViewer: ({ pdfUrl }: { pdfUrl: string | null }) => (
    <div data-testid="stub-pdf-viewer" data-pdf-url={pdfUrl ?? ''} />
  ),
}));

// Sprint 24.7 — the stub now also exposes buttons that drive the
// context's resetConversation/restoreConversation actions directly.
// This lets the shell integration tests assert what should happen
// when the real ChatUI's "New conversation" / "Continue previous"
// click handlers fire (they call those same context actions).
// We keep the heavy streaming chat out of the test, but we test the
// SHELL's behavior (dropzone returns, red-flag pane empties, etc.)
// when the context is reset.
vi.mock('@/components/chat/ChatUI', async () => {
  const { useChatStream } = await import('@/components/chat/ChatStreamContext');
  const { useRef } = await import('react');
  return {
    ChatUI: (props: {
      onToolEvent?: (event: {
        tool_name: string;
        input: Record<string, unknown>;
        result: unknown;
        audit_id: string | undefined;
      }) => void;
    }) => {
      const {
        toolEvents,
        activeLease,
        resetConversation,
        restoreConversation,
      } = useChatStream();
      const stashRef = useRef<{
        activeLease: typeof activeLease;
        toolEvents: typeof toolEvents;
      } | null>(null);
      return (
        <div data-testid="stub-chat-ui">
          <button
            type="button"
            data-testid="stub-emit-grading"
            onClick={() =>
              props.onToolEvent?.({
                tool_name: 'grade_clause_severity',
                input: { clause_id: 'c1' },
                result: {
                  clause_id: 'c1',
                  severity: 'high',
                  statute_citation: 'NJ Stat 46:8-21.2',
                  chunk_id: 'security-deposit-cap#section:1',
                  reasoning: 'r',
                  recommended_action: 'a',
                  page_number: 2,
                },
                audit_id: undefined,
              })
            }
          >
            emit
          </button>
          <button
            type="button"
            data-testid="stub-reset-conversation"
            onClick={() => {
              stashRef.current = { activeLease, toolEvents };
              resetConversation();
            }}
          >
            reset
          </button>
          <button
            type="button"
            data-testid="stub-restore-conversation"
            onClick={() => {
              if (stashRef.current) {
                restoreConversation(stashRef.current);
                stashRef.current = null;
              }
            }}
          >
            restore
          </button>
        </div>
      );
    },
  };
});

import { LeaseLensWorkspaceShell } from './LeaseLensWorkspaceShell';

afterEach(() => {
  cleanup();
  setPdfBinaryRepository(null);
  vi.restoreAllMocks();
});

beforeEach(() => {
  // URL.createObjectURL doesn't exist in happy-dom by default.
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = vi.fn();
});

function makeRepo(
  overrides: Partial<PdfBinaryRepository> = {},
): PdfBinaryRepository {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn().mockResolvedValue(undefined),
    evictExcept: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const baseProps = {
  initialMessages: [],
  conversationId: 'conv-1',
  workspaceName: 'LeaseLens — NJ Tenant Law',
};

describe('LeaseLensWorkspaceShell', () => {
  it('renders all three panes', () => {
    render(<LeaseLensWorkspaceShell {...baseProps} />);

    expect(screen.getByTestId('shell-left-pane')).toBeInTheDocument();
    expect(screen.getByTestId('shell-center-pane')).toBeInTheDocument();
    expect(screen.getByTestId('shell-right-pane')).toBeInTheDocument();
  });

  it('shows the upload dropzone in the left pane when no lease is loaded', () => {
    render(<LeaseLensWorkspaceShell {...baseProps} />);

    expect(screen.getByTestId('lease-upload-dropzone')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-pdf-viewer')).not.toBeInTheDocument();
  });

  it('renders the empty red-flag report placeholder before any grading arrives', () => {
    render(<LeaseLensWorkspaceShell {...baseProps} />);
    expect(screen.getByTestId('red-flag-report-empty')).toBeInTheDocument();
  });

  it('forwards ChatUI tool events into ChatStreamContext (RedFlagReport renders a card)', async () => {
    render(<LeaseLensWorkspaceShell {...baseProps} />);

    fireEvent.click(screen.getByTestId('stub-emit-grading'));

    await waitFor(() => {
      expect(screen.getByTestId('red-flag-card')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('red-flag-card').getAttribute('data-severity'),
    ).toBe('high');
  });

  it('swaps the upload dropzone for a PdfViewer after a successful upload', async () => {
    // Mock fetch for the upload route.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          lease_id: 'lease-uploaded',
          page_count: 4,
          clause_count: 12,
        }),
      } as unknown as Response),
    );

    render(<LeaseLensWorkspaceShell {...baseProps} />);

    const input = screen.getByTestId('lease-upload-input') as HTMLInputElement;
    const file = new File([new Uint8Array(64)], 'tenant.pdf', {
      type: 'application/pdf',
    });
    Object.defineProperty(input, 'files', { value: [file] });
    fireEvent.change(input);

    await waitFor(() => {
      expect(screen.getByTestId('stub-pdf-viewer')).toBeInTheDocument();
    });
    // Dropzone is unmounted once the lease is loaded.
    expect(
      screen.queryByTestId('lease-upload-dropzone'),
    ).not.toBeInTheDocument();
    // The blob URL is forwarded to PdfViewer.
    expect(
      screen.getByTestId('stub-pdf-viewer').getAttribute('data-pdf-url'),
    ).toMatch(/blob:|mock/);
  });

  it('exposes data-shell-route-mode for testability (Ordo-style)', () => {
    render(<LeaseLensWorkspaceShell {...baseProps} />);
    const shell = screen.getByTestId('shell-root');
    expect(shell.getAttribute('data-shell-route-mode')).toBe('three-pane');
  });

  it('right pane has its own scrollable region so red-flag cards scroll independently', () => {
    render(<LeaseLensWorkspaceShell {...baseProps} />);
    const scrollArea = screen.getByTestId('shell-right-pane-scroll-area');
    expect(scrollArea.className).toMatch(/overflow-y-auto/);
    expect(scrollArea.className).toMatch(/min-h-0/);
    // Header is sibling of the scroll area, not inside it — it should
    // not scroll out of view as cards accumulate.
    expect(screen.getByTestId('shell-right-pane-header')).toBeInTheDocument();
  });

  it('each pane is overflow-hidden so its child controls scroll independently', () => {
    render(<LeaseLensWorkspaceShell {...baseProps} />);
    expect(screen.getByTestId('shell-left-pane').className).toMatch(
      /overflow-hidden/,
    );
    expect(screen.getByTestId('shell-center-pane').className).toMatch(
      /overflow-hidden/,
    );
    expect(screen.getByTestId('shell-right-pane').className).toMatch(
      /overflow-hidden/,
    );
  });

  it('shell-root is a grid (not flex-wrap) to keep panes constrained to viewport height', () => {
    // Phase 10.5 — flex-wrap on a single-row container with default
    // align-content sized rows to CONTENT height, defeating min-h-0
    // and breaking every per-pane scroll chain. The grid replacement
    // gives each column a guaranteed full-height cell. This test
    // pins that decision so a future "let's go back to flex-wrap"
    // refactor can't silently regress the scroll fix.
    render(<LeaseLensWorkspaceShell {...baseProps} />);
    const shell = screen.getByTestId('shell-root');
    expect(shell.className).toMatch(/\bgrid\b/);
    expect(shell.className).not.toMatch(/flex-wrap/);
    expect(shell.className).toMatch(/min-h-0/);
  });

  // Sprint 24.7 — root-cause fix for "New conversation leaves lease
  // attached." Three tests pin the contract:
  //   1. resetConversation brings the upload dropzone back
  //   2. resetConversation empties the red-flag pane
  //   3. a SECOND upload after reset works without a hard refresh
  //   4. restoreConversation puts the lease + cards back (true undo)
  describe('Sprint 24.7 — full reset on New conversation', () => {
    async function uploadOnce(filename = 'tenant.pdf') {
      const input = screen.getByTestId(
        'lease-upload-input',
      ) as HTMLInputElement;
      const file = new File([new Uint8Array(64)], filename, {
        type: 'application/pdf',
      });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);
      await waitFor(() => {
        expect(screen.getByTestId('stub-pdf-viewer')).toBeInTheDocument();
      });
    }

    function mockUploadFetch(leaseId = 'lease-uploaded') {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            lease_id: leaseId,
            page_count: 4,
            clause_count: 12,
          }),
        } as unknown as Response),
      );
    }

    it('restores the upload dropzone when the context is reset', async () => {
      mockUploadFetch();
      render(<LeaseLensWorkspaceShell {...baseProps} />);

      await uploadOnce();
      expect(
        screen.queryByTestId('lease-upload-dropzone'),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('stub-reset-conversation'));

      await waitFor(() => {
        expect(screen.getByTestId('lease-upload-dropzone')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('stub-pdf-viewer')).not.toBeInTheDocument();
    });

    it('clears tool events so the red-flag pane empties on reset', async () => {
      render(<LeaseLensWorkspaceShell {...baseProps} />);

      fireEvent.click(screen.getByTestId('stub-emit-grading'));
      await waitFor(() => {
        expect(screen.getByTestId('red-flag-card')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('stub-reset-conversation'));

      await waitFor(() => {
        expect(screen.queryByTestId('red-flag-card')).not.toBeInTheDocument();
      });
      expect(screen.getByTestId('red-flag-report-empty')).toBeInTheDocument();
    });

    it('allows a second upload after reset without a hard refresh', async () => {
      mockUploadFetch('lease-A');
      render(<LeaseLensWorkspaceShell {...baseProps} />);

      await uploadOnce('first.pdf');
      fireEvent.click(screen.getByTestId('stub-reset-conversation'));
      await waitFor(() => {
        expect(screen.getByTestId('lease-upload-dropzone')).toBeInTheDocument();
      });

      // Second upload — different file, fresh blob URL.
      mockUploadFetch('lease-B');
      await uploadOnce('second.pdf');
      // The PdfViewer is mounted with whatever blob URL the test
      // harness's mocked URL.createObjectURL produced.
      expect(
        screen.getByTestId('stub-pdf-viewer').getAttribute('data-pdf-url'),
      ).toMatch(/blob:|mock/);
    });

    it('restoreConversation puts the lease and red-flag cards back (true undo)', async () => {
      mockUploadFetch();
      render(<LeaseLensWorkspaceShell {...baseProps} />);

      await uploadOnce();
      fireEvent.click(screen.getByTestId('stub-emit-grading'));
      await waitFor(() => {
        expect(screen.getByTestId('red-flag-card')).toBeInTheDocument();
      });

      // Reset (the stub snapshots state before resetting).
      fireEvent.click(screen.getByTestId('stub-reset-conversation'));
      await waitFor(() => {
        expect(screen.getByTestId('lease-upload-dropzone')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('red-flag-card')).not.toBeInTheDocument();

      // Restore — both panes should return to the pre-reset state.
      fireEvent.click(screen.getByTestId('stub-restore-conversation'));
      await waitFor(() => {
        expect(screen.getByTestId('stub-pdf-viewer')).toBeInTheDocument();
      });
      expect(screen.getByTestId('red-flag-card')).toBeInTheDocument();
    });

    it('does NOT revoke the active blob URL on reset (the undo stash still references it)', async () => {
      mockUploadFetch();
      render(<LeaseLensWorkspaceShell {...baseProps} />);

      await uploadOnce();
      const revokeSpy = global.URL.revokeObjectURL as ReturnType<typeof vi.fn>;
      revokeSpy.mockClear();

      fireEvent.click(screen.getByTestId('stub-reset-conversation'));

      // The dropzone has come back, but the Blob URL must stay alive
      // because the (stubbed) ChatUI's stash is still holding the
      // same activeLease reference for "Continue previous." Revoking
      // here was the root cause of the PDF-load failure after undo
      // (PdfViewer crashed with "Unexpected server response (0)").
      // Revocation now lives at the commit boundary inside the real
      // ChatUI — verified in page.test.tsx.
      await waitFor(() => {
        expect(screen.getByTestId('lease-upload-dropzone')).toBeInTheDocument();
      });
      expect(revokeSpy).not.toHaveBeenCalled();
    });
  });

  // Sprint 25 — server-side rehydration of toolEvents + active-lease
  // metadata. These three tests pin the new contract: role-switch and
  // cockpit round-trips don't reset the workspace because the provider
  // is seeded from initial* props, and the PDF binary restores
  // transparently via the IndexedDB-backed PdfBinaryRepository.
  describe('Sprint 25 — SSR rehydration + IndexedDB PDF restore', () => {
    it('seeds RedFlagReport from initialToolEvents (post role-switch / cockpit round-trip)', () => {
      render(
        <LeaseLensWorkspaceShell
          {...baseProps}
          initialToolEvents={[
            {
              tool_name: 'grade_clause_severity',
              input: { clause_id: 'c1' },
              result: {
                clause_id: 'c1',
                severity: 'high',
                statute_citation: 'NJ Stat 46:8-21.2',
                chunk_id: 'security-deposit-cap#section:1',
                reasoning: 'r',
                recommended_action: 'a',
                page_number: 2,
              },
              audit_id: undefined,
            },
          ]}
        />,
      );

      expect(screen.getByTestId('red-flag-card')).toBeInTheDocument();
      expect(
        screen.queryByTestId('red-flag-report-empty'),
      ).not.toBeInTheDocument();
    });

    it('restores the PdfViewer transparently when IndexedDB has the lease bytes', async () => {
      const blob = new Blob(['pdf-bytes']);
      setPdfBinaryRepository(
        makeRepo({ get: vi.fn().mockResolvedValue(blob) }),
      );

      render(
        <LeaseLensWorkspaceShell
          {...baseProps}
          initialActiveLease={{
            lease_id: 'lease-restored',
            filename: 'restored.pdf',
            page_count: 4,
            clause_count: 12,
          }}
        />,
      );

      // First paint — restoring placeholder while the IndexedDB lookup
      // is in flight.
      expect(screen.getByTestId('left-pane-restoring')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('stub-pdf-viewer')).toBeInTheDocument();
      });
      expect(
        screen.queryByTestId('lease-upload-dropzone'),
      ).not.toBeInTheDocument();
    });

    it('falls back to the re-attach pane when IndexedDB has no entry for the lease', async () => {
      setPdfBinaryRepository(
        makeRepo({ get: vi.fn().mockResolvedValue(null) }),
      );

      render(
        <LeaseLensWorkspaceShell
          {...baseProps}
          initialActiveLease={{
            lease_id: 'lease-evicted',
            filename: 'evicted.pdf',
            page_count: 4,
            clause_count: 12,
          }}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('left-pane-reattach')).toBeInTheDocument();
      });
      // The dropzone is still mounted inside the re-attach pane so the
      // user can recover with a re-upload.
      expect(screen.getByTestId('lease-upload-dropzone')).toBeInTheDocument();
      expect(screen.queryByTestId('stub-pdf-viewer')).not.toBeInTheDocument();
    });

    it('writes the uploaded file to the PdfBinaryRepository on upload', async () => {
      const put = vi.fn().mockResolvedValue(undefined);
      setPdfBinaryRepository(makeRepo({ put }));

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            lease_id: 'lease-cached',
            page_count: 4,
            clause_count: 12,
          }),
        } as unknown as Response),
      );

      render(<LeaseLensWorkspaceShell {...baseProps} />);

      const input = screen.getByTestId(
        'lease-upload-input',
      ) as HTMLInputElement;
      const file = new File([new Uint8Array(64)], 'tenant.pdf', {
        type: 'application/pdf',
      });
      Object.defineProperty(input, 'files', { value: [file] });
      fireEvent.change(input);

      await waitFor(() => {
        expect(put).toHaveBeenCalledWith('lease-cached', expect.any(File));
      });
    });
  });

  // S20.1 — pane widths read from CSS vars (--pane-left, --pane-right)
  // so S20.3's resize handles can rewrite them without touching layout
  // code. Defaults render even before any localStorage write.
  it('S20.1 — left/right pane widths are driven by CSS variables with sensible defaults', () => {
    render(<LeaseLensWorkspaceShell {...baseProps} />);
    const shell = screen.getByTestId('shell-root');
    // Grid-template-columns references both CSS vars.
    expect(shell.className).toMatch(/var\(--pane-left/);
    expect(shell.className).toMatch(/var\(--pane-right/);
    // Inline style provides the initial values so the layout is correct
    // on the first paint (before any client effect runs).
    const inlineStyle = shell.getAttribute('style') ?? '';
    expect(inlineStyle).toMatch(/--pane-left/);
    expect(inlineStyle).toMatch(/--pane-right/);
  });
});
