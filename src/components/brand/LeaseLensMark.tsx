'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

/*
 * Sprint 17.2 — LeaseLens brand mark.
 *
 * A bespoke inline SVG that literalises the product: a document with three
 * text lines and a magnifying glass, scanned once by a horizontal accent
 * sweep on first mount. Replaces the generic lucide FileSearch so the brand
 * identity is unique to LeaseLens. Stroke colour is `currentColor`, so the
 * mark inherits whatever text colour its container sets (white on the
 * accent-600 badge, accent-600 on a neutral background, etc.).
 *
 * Motion is intentionally restrained: one-shot scan on mount (~900ms),
 * then static. Hover gives the lens a small breathing pulse — readable at
 * small sizes without competing for attention. Users with
 * `prefers-reduced-motion` get the static version (no scan, no hover scale).
 */

export interface LeaseLensMarkProps {
  /** Rendered pixel size. Defaults to 14px to match the legacy h-3.5 footprint. */
  size?: number;
  /** Disable the one-shot scan animation. Defaults to enabled. */
  animated?: boolean;
  className?: string;
}

const VIEWBOX = 24;
const SCAN_START_Y = 5;
const SCAN_END_Y = 18.5;
const SCAN_DURATION_S = 0.9;
const HOVER_LENS_SCALE = 1.08;

export function LeaseLensMark({
  size = 14,
  animated = true,
  className,
}: LeaseLensMarkProps): React.JSX.Element {
  const reduced = useReducedMotion();
  // Gate animation on a client-only flag so the SSR markup stays identical
  // to the no-motion render — avoids hydration mismatch on the homepage.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const allowMotion = animated && mounted && !reduced;

  return (
    <motion.svg
      role="img"
      aria-label="LeaseLens"
      width={size}
      height={size}
      viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      whileHover={allowMotion ? 'hover' : undefined}
      initial="rest"
      animate="rest"
    >
      {/* Document frame */}
      <rect x="4" y="3" width="13" height="18" rx="1.5" />
      {/* Text lines — slightly thinner so the frame reads as the primary shape */}
      <line x1="7" y1="8" x2="14" y2="8" strokeWidth={1.5} />
      <line x1="7" y1="11.5" x2="14" y2="11.5" strokeWidth={1.5} />
      <line x1="7" y1="15" x2="11.5" y2="15" strokeWidth={1.5} />

      {/* One-shot scan sweep on mount. Rendered only while motion is allowed
          so the resting icon stays identical to the reduced-motion render. */}
      {allowMotion ? <ScanSweep /> : null}

      {/* Magnifying glass — static frame, gentle scale pulse on hover */}
      <motion.g
        variants={{
          rest: { scale: 1 },
          hover: { scale: HOVER_LENS_SCALE },
        }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: '17px 17px', transformBox: 'fill-box' }}
      >
        <circle cx="17" cy="17" r="3" />
        <line x1="19.2" y1="19.2" x2="21" y2="21" strokeWidth={2.2} />
      </motion.g>
    </motion.svg>
  );
}

/*
 * Horizontal scan line that translates from the top of the document to the
 * bottom and fades out at the end. We animate a `y` transform (CSS-driven)
 * rather than the SVG y1/y2 attributes so motion/react can interpolate it
 * cheaply on the compositor.
 */
function ScanSweep(): React.JSX.Element {
  return (
    <motion.line
      x1="5.5"
      y1="0"
      x2="15.5"
      y2="0"
      strokeWidth={1.5}
      initial={{ y: SCAN_START_Y, opacity: 0 }}
      animate={{
        y: [SCAN_START_Y, SCAN_END_Y, SCAN_END_Y],
        opacity: [0, 1, 0],
      }}
      transition={{
        duration: SCAN_DURATION_S,
        times: [0, 0.75, 1],
        ease: [0.22, 1, 0.36, 1],
      }}
    />
  );
}
