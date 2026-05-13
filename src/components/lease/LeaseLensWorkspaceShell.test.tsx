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

// Stub the heavy children so we can assert on the shell's wiring.
vi.mock('@/components/lease/PdfViewer', () => ({
  PdfViewer: ({ pdfUrl }: { pdfUrl: string | null }) => (
    <div data-testid="stub-pdf-viewer" data-pdf-url={pdfUrl ?? ''} />
  ),
}));

vi.mock('@/components/chat/ChatUI', () => ({
  ChatUI: (props: {
    onToolEvent?: (event: {
      tool_name: string;
      input: Record<string, unknown>;
      result: unknown;
      audit_id: string | undefined;
    }) => void;
  }) => (
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
    </div>
  ),
}));

import { LeaseLensWorkspaceShell } from './LeaseLensWorkspaceShell';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  // URL.createObjectURL doesn't exist in happy-dom by default.
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = vi.fn();
});

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
