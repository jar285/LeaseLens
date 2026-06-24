// Sprint 46.4 — PDF highlight rendering (integration).
//
// The matcher + render helpers are unit-tested purely elsewhere; here we
// confirm the WIRING: customTextRenderer wraps graded clause text in a
// severity <mark>, non-matching text is escaped passthrough, the default
// filter hides Low/OK, and a scanned (empty text-layer) page shows the
// graceful "unavailable" notice. The react-pdf mock simulates the text
// layer: it calls onGetTextSuccess with the page's items, then renders
// each item through customTextRenderer the way react-pdf does.

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { withChatStream } from '@/components/chat/test-helpers';
import { useLeaseParser } from './LeaseParserContext';
import { useHighlightSettings } from './PdfHighlightContext';

const h = vi.hoisted(() => ({
  registry: {} as Record<number, Array<{ str: string; hasEOL?: boolean }>>,
}));

// Sprint 54 — the mock fires react-pdf's load callbacks from effects
// (post-render), not synchronously during render. Real react-pdf resolves the
// document + text layer asynchronously (`.then`) and never calls these during
// render; the old sync-during-render calls made PdfViewerClient's
// setNumPages/setEmptyTextPages run while a different component (Document/Page)
// was rendering, tripping React 19's "Cannot update a component while rendering
// a different component" warning. Production was never affected (real callbacks
// are async). The Page mock fires onGetTextSuccess in an effect (which populates
// pageItemsRef) and then forces one re-render, so customTextRenderer reads the
// now-populated ref and still draws marks — `act()` flushes both synchronously.
vi.mock('react-pdf', async () => {
  const { useEffect, useState } = await import('react');
  return {
    Document: ({
      onLoadSuccess,
      children,
    }: {
      onLoadSuccess?: (d: { numPages: number }) => void;
      children?: React.ReactNode;
    }) => {
      useEffect(() => {
        onLoadSuccess?.({ numPages: Object.keys(h.registry).length || 1 });
      }, []);
      return <div data-testid="mock-pdf-document">{children}</div>;
    },
    Page: ({
      pageNumber,
      customTextRenderer,
      onGetTextSuccess,
    }: {
      pageNumber: number;
      customTextRenderer?: (a: { str: string; itemIndex: number }) => string;
      onGetTextSuccess?: (d: {
        items: Array<{ str: string; hasEOL?: boolean }>;
      }) => void;
    }) => {
      const items = h.registry[pageNumber] ?? [];
      const [, forceRerender] = useState(0);
      // Populate the text layer post-render, then re-render once so
      // customTextRenderer reads the now-populated pageItemsRef and draws marks.
      useEffect(() => {
        onGetTextSuccess?.({ items });
        forceRerender((n) => n + 1);
      }, []);
      return (
        <div data-testid="mock-pdf-page" data-page-number={pageNumber}>
          {items.map((it, i) => {
            const html = customTextRenderer
              ? customTextRenderer({ str: it.str, itemIndex: i })
              : it.str;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: stable test items
                key={i}
                data-item-index={i}
                // biome-ignore lint/security/noDangerouslySetInnerHtml: mock mirrors react-pdf's HTML injection
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          })}
        </div>
      );
    },
    pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
  };
});

import { PdfViewerClient } from './PdfViewer.client';

afterEach(() => {
  cleanup();
  h.registry = {};
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Stub prefers-reduced-motion. matchMedia is what prefersReducedMotion reads.
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const LEASE = 'L1';

function extractEvent(
  clauses: Array<{
    clause_id: string;
    clause_index: number;
    page_number: number;
    text: string;
    clause_type: string;
  }>,
): ToolEvent {
  return {
    tool_name: 'extract_clauses',
    input: {},
    result: { lease_id: LEASE, clauses },
    audit_id: undefined,
  };
}

function gradeEvent(clauseId: string, severity: string): ToolEvent {
  return {
    tool_name: 'grade_clause_severity',
    input: { clause_id: clauseId },
    result: {
      clause_id: clauseId,
      severity,
      statute_citation: 'N.J.S.A. 46:8-21.1',
      chunk_id: 'c',
      reasoning: 'r',
      recommended_action: 'a',
    },
    audit_id: undefined,
  };
}

const HIGH_AND_LOW: ToolEvent[] = [
  extractEvent([
    {
      clause_id: 'c1',
      clause_index: 0,
      page_number: 1,
      clause_type: 'security_deposit',
      text: 'security deposit equal to two months',
    },
    {
      clause_id: 'c2',
      clause_index: 1,
      page_number: 1,
      clause_type: 'parking',
      text: 'parking is limited to one space',
    },
  ]),
  gradeEvent('c1', 'high'),
  gradeEvent('c2', 'low'),
];

function renderViewer(events: ToolEvent[]) {
  return render(
    withChatStream(<PdfViewerClient pdfUrl="/sample.pdf" pageCount={1} />, {
      initialEvents: events,
      activeLease: { lease_id: LEASE, filename: 'lease.pdf' },
    }),
  );
}

describe('PdfViewerClient — highlights', () => {
  it('wraps a graded high-severity clause in a severity <mark>', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
        { str: 'Parking is limited to one space per <unit>.' },
      ],
    };
    const { container } = renderViewer(HIGH_AND_LOW);

    const mark = container.querySelector('mark[data-clause-id="c1"]');
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute('data-severity')).toBe('high');
    expect(mark?.getAttribute('aria-label')).toBe(
      'Highlighted clause: Security deposit, high concern, page 1',
    );
    expect(mark?.textContent).toContain('security deposit equal to two months');
  });

  it('does NOT mark a Low clause by default (filter hides Low) and escapes its text', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
        { str: 'Parking is limited to one space per <unit>.' },
      ],
    };
    const { container } = renderViewer(HIGH_AND_LOW);

    expect(container.querySelector('mark[data-clause-id="c2"]')).toBeNull();
    // the non-marked item is escaped passthrough — the literal < survives as text
    expect(container.innerHTML).toContain('&lt;unit&gt;');
  });

  it('shows the "highlights unavailable" notice on a scanned (empty text layer) page', () => {
    h.registry = { 1: [] }; // no selectable text
    renderViewer(HIGH_AND_LOW);
    expect(
      screen.getByTestId('pdf-highlights-unavailable'),
    ).toBeInTheDocument();
  });

  it('renders no marks before a scan completes (no graded clauses)', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    // extract only, no grades → scan not complete → byPage empty
    const { container } = renderViewer([
      extractEvent([
        {
          clause_id: 'c1',
          clause_index: 0,
          page_number: 1,
          clause_type: 'security_deposit',
          text: 'security deposit equal to two months',
        },
      ]),
    ]);
    expect(container.querySelector('mark[data-clause-id]')).toBeNull();
  });
});

// Sprint 46.5 — active-clause emphasis.
const HIGH_ONLY: ToolEvent[] = [
  extractEvent([
    {
      clause_id: 'c1',
      clause_index: 0,
      page_number: 1,
      clause_type: 'security_deposit',
      text: 'security deposit equal to two months',
    },
  ]),
  gradeEvent('c1', 'high'),
];

function renderWithActiveSetter(events: ToolEvent[]): {
  container: HTMLElement;
  setActive: (id: string | null) => void;
} {
  let setActive: (id: string | null) => void = () => {};
  function Probe() {
    setActive = useLeaseParser().setActiveClauseId;
    return null;
  }
  const { container } = render(
    withChatStream(
      <>
        <PdfViewerClient pdfUrl="/sample.pdf" pageCount={1} />
        <Probe />
      </>,
      {
        initialEvents: events,
        activeLease: { lease_id: LEASE, filename: 'lease.pdf' },
      },
    ),
  );
  return { container, setActive: (id) => setActive(id) };
}

describe('PdfViewerClient — active-clause emphasis', () => {
  it('scrolls to and pulses the active clause mark (motion allowed)', () => {
    stubReducedMotion(false);
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container, setActive } = renderWithActiveSetter(HIGH_ONLY);
    expect(container.querySelector('mark[data-clause-id="c1"]')).not.toBeNull();

    act(() => setActive('c1'));

    expect(scrollIntoView).toHaveBeenCalled();
    const mark = container.querySelector('mark[data-clause-id="c1"]');
    expect(mark?.classList.contains('ll-hl--pulse')).toBe(true);
  });

  it('uses a static outline (no pulse) under prefers-reduced-motion', () => {
    stubReducedMotion(true);
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container, setActive } = renderWithActiveSetter(HIGH_ONLY);

    act(() => setActive('c1'));

    const mark = container.querySelector('mark[data-clause-id="c1"]');
    expect(mark?.classList.contains('ll-hl--active')).toBe(true);
    expect(mark?.classList.contains('ll-hl--pulse')).toBe(false);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'center',
    });
  });

  it('does not scroll when the active clause has no mark on the page', () => {
    stubReducedMotion(false);
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { setActive } = renderWithActiveSetter(HIGH_ONLY);

    act(() => setActive('clause-not-on-this-page'));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

// Sprint 46.8 — regression + integration.
const HIGH_AND_LOW_P1: ToolEvent[] = [
  extractEvent([
    {
      clause_id: 'c1',
      clause_index: 0,
      page_number: 1,
      clause_type: 'security_deposit',
      text: 'security deposit equal to two months',
    },
    {
      clause_id: 'c2',
      clause_index: 1,
      page_number: 1,
      clause_type: 'late_fee',
      text: 'late fee of ten percent per day',
    },
  ]),
  gradeEvent('c1', 'high'),
  gradeEvent('c2', 'low'),
];

describe('PdfViewerClient — highlight regressions', () => {
  it('removes all highlights when the lease is replaced (resetParser)', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    let reset: () => void = () => {};
    function Probe() {
      reset = useLeaseParser().resetParser;
      return null;
    }
    const { container } = render(
      withChatStream(
        <>
          <PdfViewerClient pdfUrl="/sample.pdf" pageCount={1} />
          <Probe />
        </>,
        {
          initialEvents: HIGH_ONLY,
          activeLease: { lease_id: LEASE, filename: 'lease.pdf' },
        },
      ),
    );
    expect(container.querySelector('mark[data-clause-id="c1"]')).not.toBeNull();

    act(() => reset());

    expect(container.querySelector('mark[data-clause-id]')).toBeNull();
  });

  it('re-renders marks when a severity filter is toggled on', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
        { str: 'A late fee of ten percent per day applies after the fifth.' },
      ],
    };
    let toggle: (s: 'high' | 'medium' | 'low' | 'ok') => void = () => {};
    function Probe() {
      toggle = useHighlightSettings().toggleSeverity;
      return null;
    }
    const { container } = render(
      withChatStream(
        <>
          <PdfViewerClient pdfUrl="/sample.pdf" pageCount={1} />
          <Probe />
        </>,
        {
          initialEvents: HIGH_AND_LOW_P1,
          activeLease: { lease_id: LEASE, filename: 'lease.pdf' },
        },
      ),
    );
    // default: high shown, low (c2) hidden
    expect(container.querySelector('mark[data-clause-id="c1"]')).not.toBeNull();
    expect(container.querySelector('mark[data-clause-id="c2"]')).toBeNull();

    act(() => toggle('low'));

    expect(container.querySelector('mark[data-clause-id="c2"]')).not.toBeNull();
  });
});

// Sprint 47.2 — evidence-frame overlay (cohesive halo for the active /
// hovered clause). happy-dom returns zero rects, so we assert the frame
// element's PRESENCE + attributes, not its pixel geometry.
describe('PdfViewerClient — evidence frame overlay', () => {
  it('renders no frame when nothing is active or hovered', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container } = renderViewer(HIGH_ONLY);
    expect(
      container.querySelector('[data-testid="pdf-evidence-frame"]'),
    ).toBeNull();
  });

  it('renders an active frame for the selected clause', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container, setActive } = renderWithActiveSetter(HIGH_ONLY);
    act(() => setActive('c1'));

    const frame = container.querySelector('[data-testid="pdf-evidence-frame"]');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('data-clause-id')).toBe('c1');
    expect(frame?.getAttribute('data-severity')).toBe('high');
    expect(frame?.getAttribute('data-variant')).toBe('active');
  });

  it('removes the frame when the active clause is cleared', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container, setActive } = renderWithActiveSetter(HIGH_ONLY);
    act(() => setActive('c1'));
    expect(
      container.querySelector('[data-testid="pdf-evidence-frame"]'),
    ).not.toBeNull();

    act(() => setActive(null));
    expect(
      container.querySelector('[data-testid="pdf-evidence-frame"]'),
    ).toBeNull();
  });

  it('Sprint 52.6 — clears evidence frames immediately when highlights are hidden', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    let setActive: (id: string | null) => void = () => {};
    let setShow: (value: boolean) => void = () => {};
    function Probe() {
      const parser = useLeaseParser();
      const highlight = useHighlightSettings();
      setActive = parser.setActiveClauseId;
      setShow = highlight.setShowHighlights;
      return null;
    }
    const { container } = render(
      withChatStream(
        <>
          <PdfViewerClient pdfUrl="/sample.pdf" pageCount={1} />
          <Probe />
        </>,
        {
          initialEvents: HIGH_ONLY,
          activeLease: { lease_id: LEASE, filename: 'lease.pdf' },
        },
      ),
    );
    act(() => setActive('c1'));
    expect(
      container.querySelector('[data-testid="pdf-evidence-frame"]'),
    ).not.toBeNull();

    act(() => setShow(false));
    expect(
      container.querySelector('[data-testid="pdf-evidence-frame"]'),
    ).toBeNull();
  });

  it('renders a hover-variant frame when a mark is hovered', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container } = renderViewer(HIGH_ONLY);
    const mark = container.querySelector<HTMLElement>(
      'mark[data-clause-id="c1"]',
    );
    if (mark) fireEvent.mouseOver(mark);

    const frame = container.querySelector('[data-testid="pdf-evidence-frame"]');
    expect(frame?.getAttribute('data-variant')).toBe('hover');
  });

  it('shows a floating evidence label ("type · §N") on the active clause only', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container, setActive } = renderWithActiveSetter(HIGH_ONLY);
    // nothing active → no label
    expect(
      container.querySelector('[data-testid="pdf-evidence-label"]'),
    ).toBeNull();

    act(() => setActive('c1'));
    const label = container.querySelector('[data-testid="pdf-evidence-label"]');
    expect(label).not.toBeNull();
    // Sprint 48.1 — label carries severity in text, not colour alone.
    expect(label?.textContent).toBe('Security deposit · §1 · High concern');
  });
});

// Sprint 48.1 — selected-evidence focus: the page container dims the
// non-active passive marks while a clause is selected.
describe('PdfViewerClient — selected-evidence focus', () => {
  it('adds ll-focus-mode to the page container only while a clause is active', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container, setActive } = renderWithActiveSetter(HIGH_ONLY);
    const pageContainer = () =>
      container.querySelector('[data-testid="pdf-page-container"]');
    expect(pageContainer()?.classList.contains('ll-focus-mode')).toBe(false);

    act(() => setActive('c1'));
    expect(pageContainer()?.classList.contains('ll-focus-mode')).toBe(true);

    act(() => setActive(null));
    expect(pageContainer()?.classList.contains('ll-focus-mode')).toBe(false);
  });
});

// Sprint 47.4 — one-shot reveal of passive highlights on first appearance.
describe('PdfViewerClient — reveal motion', () => {
  it('adds the one-shot reveal class to the page container when motion is allowed', () => {
    stubReducedMotion(false);
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container } = renderViewer(HIGH_ONLY);
    expect(
      container
        .querySelector('[data-testid="pdf-page-container"]')
        ?.classList.contains('ll-reveal'),
    ).toBe(true);
  });

  it('does NOT add the reveal class under prefers-reduced-motion', () => {
    stubReducedMotion(true);
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container } = renderViewer(HIGH_ONLY);
    expect(
      container
        .querySelector('[data-testid="pdf-page-container"]')
        ?.classList.contains('ll-reveal'),
    ).toBe(false);
  });
});

// Sprint 48.2 — Turnitin-style evidence gutter markers.
describe('PdfViewerClient — evidence gutter', () => {
  it('renders a gutter marker per VISIBLE red-flagged clause (Low hidden by default)', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
        { str: 'Parking is limited to one space per car.' },
      ],
    };
    const { container } = renderViewer(HIGH_AND_LOW); // c1 high (shown), c2 low (hidden)
    const markers = container.querySelectorAll(
      '[data-testid="pdf-evidence-gutter-marker"]',
    );
    expect(markers.length).toBe(1);
    expect(markers[0].getAttribute('data-clause-id')).toBe('c1');
    expect(markers[0].getAttribute('data-severity')).toBe('high');
    expect(markers[0].getAttribute('aria-label')).toContain('Security deposit');
    expect(markers[0].getAttribute('aria-label')).toContain('High concern');
  });

  it('clicking a gutter marker activates that clause (frame appears)', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container } = renderViewer(HIGH_ONLY);
    const marker = container.querySelector<HTMLElement>(
      '[data-testid="pdf-evidence-gutter-marker"]',
    );
    expect(marker).not.toBeNull();
    if (marker) fireEvent.click(marker);

    const frame = container.querySelector(
      '[data-testid="pdf-evidence-frame"][data-variant="active"]',
    );
    expect(frame?.getAttribute('data-clause-id')).toBe('c1');
  });

  it('renders no gutter markers when highlights are hidden', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    let setShow: (v: boolean) => void = () => {};
    function Probe() {
      setShow = useHighlightSettings().setShowHighlights;
      return null;
    }
    const { container } = render(
      withChatStream(
        <>
          <PdfViewerClient pdfUrl="/sample.pdf" pageCount={1} />
          <Probe />
        </>,
        {
          initialEvents: HIGH_ONLY,
          activeLease: { lease_id: LEASE, filename: 'lease.pdf' },
        },
      ),
    );
    expect(
      container.querySelector('[data-testid="pdf-evidence-gutter-marker"]'),
    ).not.toBeNull();

    act(() => setShow(false));
    expect(
      container.querySelector('[data-testid="pdf-evidence-gutter-marker"]'),
    ).toBeNull();
  });
});

// Sprint 46.6 — PDF→card hover bridge: hovering a mark emphasizes it via
// the delegated listener → hoveredClauseId → effect.
describe('PdfViewerClient — hover bridge', () => {
  it('adds the hover class to a mark on mouse-over and removes it on mouse-out', () => {
    h.registry = {
      1: [
        {
          str: 'Tenant shall provide a security deposit equal to two months rent.',
        },
      ],
    };
    const { container } = renderViewer(HIGH_ONLY);
    const getMark = () =>
      container.querySelector<HTMLElement>('mark[data-clause-id="c1"]');
    expect(getMark()).not.toBeNull();

    const target = getMark();
    if (target) fireEvent.mouseOver(target);
    expect(getMark()?.classList.contains('ll-hl--hover')).toBe(true);

    const target2 = getMark();
    if (target2) fireEvent.mouseOut(target2);
    expect(getMark()?.classList.contains('ll-hl--hover')).toBe(false);
  });
});
