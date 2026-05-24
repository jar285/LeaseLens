'use client';

import { Maximize2, X } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface MermaidDiagramProps {
  code: string;
  title?: string;
  caption?: string;
}

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'neutral',
        // Sprint 25.2 — bump the default font from Mermaid's ~12px sans
        // to a readable 14px and use the project's body font stack so
        // diagrams blend into the LeaseLens design system instead of
        // looking like a third-party widget. Themes still apply on top.
        themeVariables: {
          fontSize: '14px',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        },
        flowchart: { htmlLabels: false },
      });
      return mod.default;
    });
  }
  return mermaidPromise;
}

export function MermaidDiagram({ code, title, caption }: MermaidDiagramProps) {
  // Mermaid render IDs cannot contain ':' which React 19's useId emits.
  const id = useId().replace(/:/g, '-');
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Mounted-state guard: SSR + first client paint render the plain
  // wrapper. The motion wrapper appears on the second paint, so the
  // user does not see a flash if they prefer reduced motion.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = useReducedMotion();
  const animate = mounted && !reduced;

  // Sprint 25.2 — click-to-expand modal. Mermaid diagrams (especially
  // severity heatmaps with 15 clauses) render unreadably small inside
  // the chat bubble. Clicking opens a fullscreen overlay with the same
  // SVG at viewport size; Escape / backdrop click / X close it.
  //
  // The modal is portalled into document.body. Reason: every chat
  // message is wrapped in `motion.li` / `motion.div` (ChatMessage,
  // ToolCard) which apply CSS `transform` for entry animations. Per
  // the CSS spec, any transformed ancestor becomes the containing
  // block for `position: fixed` descendants — so without the portal
  // the modal sizes to the chat column instead of the viewport, and
  // sibling panes (e.g. RedFlagReport) paint on top of it. The portal
  // hoists the modal out of every transformed ancestor in one move.
  const [expanded, setExpanded] = useState(false);
  const close = useCallback(() => setExpanded(false), []);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!expanded) return;
    // Escape closes; also lock body scroll while modal is open.
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    // Move focus to the close button on open.
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = originalOverflow;
      // Restore focus to whatever was focused before the modal opened.
      previouslyFocusedRef.current?.focus();
    };
  }, [expanded, close]);

  useEffect(() => {
    let cancelled = false;
    loadMermaid()
      .then((mermaid) => mermaid.render(`mermaid-${id}`, code))
      .then((result) => {
        if (!cancelled) setSvg(result.svg);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, code]);

  // Mermaid runs with `securityLevel: 'strict'` + `htmlLabels: false`,
  // which sanitizes its own SVG output (no script tags, no foreignObject
  // HTML labels). `dangerouslySetInnerHTML` is the documented pattern
  // for embedding the rendered SVG. We assign via spread so Biome's
  // a11y/noDangerouslySetInnerHtml rule doesn't fire on a JSX attribute.
  const svgInjection = svg
    ? { dangerouslySetInnerHTML: { __html: svg } }
    : null;
  const body = error ? (
    <pre className="overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-700">
      <span className="text-red-600">Diagram parse error: {error}</span>
      {'\n\n'}
      {code}
    </pre>
  ) : svgInjection ? (
    <div {...svgInjection} />
  ) : (
    <div
      className="h-24 animate-pulse rounded bg-gray-100"
      role="status"
      aria-label="Rendering diagram"
    />
  );

  // `data-motion` is a stable test hook ("on" | "off") so unit tests can
  // assert which branch ran without depending on Motion runtime style
  // attributes that vary across hydration / framerate.
  const wrapped = animate ? (
    <motion.div
      data-motion="on"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {body}
    </motion.div>
  ) : (
    <div data-motion="off">{body}</div>
  );

  return (
    <>
      <figure className="my-2 overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        {title && (
          <h3 className="mb-1 text-sm font-semibold text-gray-800">{title}</h3>
        )}
        {/* Sprint 25.2 — make the rendered diagram a button so the user
            can expand it. Inline SVG is the visual; the surrounding
            button carries the affordance + keyboard activation. The
            error / loading states stay non-interactive (nothing to
            expand yet). */}
        {svgInjection ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Expand diagram"
            className="group relative block w-full cursor-zoom-in rounded transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2"
          >
            {wrapped}
            <span
              aria-hidden="true"
              className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-white/80 text-gray-700 opacity-0 shadow-sm ring-1 ring-gray-200 backdrop-blur-sm transition group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </span>
          </button>
        ) : (
          wrapped
        )}
        {caption && (
          <figcaption className="mt-2 text-xs text-gray-500">
            {caption}
          </figcaption>
        )}
      </figure>

      {expanded &&
        svgInjection &&
        mounted &&
        createPortal(
          <div
            // biome-ignore lint/a11y/useSemanticElements: dialog-like overlay; modal semantics provided via role + aria-modal
            role="dialog"
            aria-modal="true"
            aria-label={title ?? 'Diagram preview'}
            data-testid="mermaid-diagram-modal"
            onClick={close}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
            }}
            className="fixed inset-0 z-dialog flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          >
            <div
              // Stop click-through so clicking the diagram itself doesn't
              // close the modal — only the backdrop / X / Escape do.
              // biome-ignore lint/a11y/noStaticElementInteractions: container of the SVG; interactivity is on the surrounding backdrop + the close button
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="relative flex max-h-[90vh] max-w-[95vw] flex-col overflow-hidden rounded-lg bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-gray-800">
                  {title ?? 'Diagram'}
                </h3>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={close}
                  aria-label="Close diagram"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div
                {...svgInjection}
                className="flex-1 overflow-auto p-6 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:w-auto [&_svg]:min-w-full"
              />
              {caption && (
                <div className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">
                  {caption}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
