'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useId, useState } from 'react';

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
  // for embedding the rendered SVG.
  const svgInjection = svg
    ? // biome-ignore lint/security/noDangerouslySetInnerHtml: see comment above
      { dangerouslySetInnerHTML: { __html: svg } }
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
    <figure className="my-2 overflow-hidden rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      {title && (
        <h3 className="mb-1 text-sm font-semibold text-gray-800">{title}</h3>
      )}
      {wrapped}
      {caption && (
        <figcaption className="mt-2 text-xs text-gray-500">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
