// Sprint 27 — high-level scan lifecycle (red-flags panel).
//
// `useScanProgress` already exposes a low-level phase machine
// (idle/extracting/grading/complete) that drives skeleton counts and
// the panel header. For the new red-flags loading UX we want the same
// signal narrated as six user-facing stages:
//
//   upload_received → reading_lease → extracting_clauses →
//   checking_clauses → preparing_red_flags → review_ready
//
// `computeScanLifecycleStage` is a pure derivation that maps the
// underlying `{ hasActiveLease, toolEvents, scanProgress, preparingDone }`
// inputs onto one of the seven lifecycle stages (including `idle` when
// no lease is present). Pure so we can unit-test every transition
// without React or timers.

import { describe, expect, it } from 'vitest';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { computeScanLifecycleStage, LIFECYCLE_STAGES } from './scan-lifecycle';
import type { ScanProgress } from './use-scan-progress';

function progress(partial: Partial<ScanProgress>): ScanProgress {
  return {
    phase: 'idle',
    total: 0,
    attempted: 0,
    label: '',
    ...partial,
  };
}

describe('computeScanLifecycleStage', () => {
  it('returns idle when no lease is active and no scan is in flight', () => {
    const snap = computeScanLifecycleStage({
      hasActiveLease: false,
      toolEvents: [],
      scanProgress: progress({ phase: 'idle' }),
      preparingDone: false,
    });
    expect(snap.stage).toBe('idle');
  });

  it('returns idle when extract resolved with zero clauses (degenerate scan)', () => {
    // Showing "Extracting clauses" forever when extract returned []
    // would lie to the user. The empty state with example preview is
    // the right surface in that case.
    const snap = computeScanLifecycleStage({
      hasActiveLease: false,
      toolEvents: [],
      scanProgress: progress({ phase: 'extracting', total: 0 }),
      preparingDone: false,
    });
    expect(snap.stage).toBe('idle');
  });

  it('falls through to a scan-derived stage when an extract event has landed even if hasActiveLease is false (rehydration / test fixtures)', () => {
    // A scan in flight is authoritative: if the tool stream reports
    // a non-idle phase, the lifecycle must reflect that even when the
    // activeLease ref hasn't been threaded through (e.g. tests, rehydration races).
    const snap = computeScanLifecycleStage({
      hasActiveLease: false,
      toolEvents: [],
      scanProgress: progress({ phase: 'extracting', total: 3 }),
      preparingDone: false,
    });
    expect(snap.stage).toBe('extracting_clauses');
  });

  it('returns upload_received when lease is active but no tool events yet', () => {
    const snap = computeScanLifecycleStage({
      hasActiveLease: true,
      toolEvents: [],
      scanProgress: progress({ phase: 'idle' }),
      preparingDone: false,
    });
    expect(snap.stage).toBe('upload_received');
    expect(snap.label).toMatch(/upload/i);
  });

  it('returns reading_lease once the stream has begun but extract_clauses has not landed', () => {
    // Some non-extract tool result (e.g. an interim metadata event)
    // is in the stream but the canonical extract_clauses result hasn't
    // arrived. scanProgress still reports phase='idle'.
    const events: ToolEvent[] = [
      {
        tool_use_id: 'tu-1',
        tool_name: 'some_intermediate_tool',
        input: {},
        result: {},
      } as unknown as ToolEvent,
    ];
    const snap = computeScanLifecycleStage({
      hasActiveLease: true,
      toolEvents: events,
      scanProgress: progress({ phase: 'idle' }),
      preparingDone: false,
    });
    expect(snap.stage).toBe('reading_lease');
    expect(snap.label.toLowerCase()).toContain('reading');
  });

  it('returns extracting_clauses when phase is "extracting" with a known total', () => {
    const snap = computeScanLifecycleStage({
      hasActiveLease: true,
      toolEvents: [],
      scanProgress: progress({ phase: 'extracting', total: 12 }),
      preparingDone: false,
    });
    expect(snap.stage).toBe('extracting_clauses');
    expect(snap.label.toLowerCase()).toContain('extracting');
    // Live count surfaces as subtext.
    expect(snap.detail).toMatch(/12/);
  });

  it('returns checking_clauses while grading is in flight, with M-of-N subtext', () => {
    const snap = computeScanLifecycleStage({
      hasActiveLease: true,
      toolEvents: [],
      scanProgress: progress({
        phase: 'grading',
        total: 12,
        attempted: 7,
      }),
      preparingDone: false,
    });
    expect(snap.stage).toBe('checking_clauses');
    expect(snap.label.toLowerCase()).toContain('nj');
    expect(snap.detail).toMatch(/7/);
    expect(snap.detail).toMatch(/12/);
  });

  it('returns preparing_red_flags briefly after grading completes (preparingDone=false)', () => {
    const snap = computeScanLifecycleStage({
      hasActiveLease: true,
      toolEvents: [],
      scanProgress: progress({
        phase: 'complete',
        total: 12,
        attempted: 12,
      }),
      preparingDone: false,
    });
    expect(snap.stage).toBe('preparing_red_flags');
    expect(snap.label.toLowerCase()).toContain('preparing');
  });

  it('returns review_ready once preparingDone is true', () => {
    const snap = computeScanLifecycleStage({
      hasActiveLease: true,
      toolEvents: [],
      scanProgress: progress({
        phase: 'complete',
        total: 12,
        attempted: 12,
      }),
      preparingDone: true,
    });
    expect(snap.stage).toBe('review_ready');
    expect(snap.label.toLowerCase()).toContain('ready');
  });

  it('exposes a stable LIFECYCLE_STAGES order so the UI can render every stage as a row', () => {
    expect(LIFECYCLE_STAGES).toEqual([
      'upload_received',
      'reading_lease',
      'extracting_clauses',
      'checking_clauses',
      'preparing_red_flags',
      'review_ready',
    ]);
  });

  it('index field corresponds to position in LIFECYCLE_STAGES (and is -1 for idle)', () => {
    const idle = computeScanLifecycleStage({
      hasActiveLease: false,
      toolEvents: [],
      scanProgress: progress({ phase: 'idle' }),
      preparingDone: false,
    });
    expect(idle.index).toBe(-1);

    const extracting = computeScanLifecycleStage({
      hasActiveLease: true,
      toolEvents: [],
      scanProgress: progress({ phase: 'extracting', total: 5 }),
      preparingDone: false,
    });
    expect(extracting.index).toBe(
      LIFECYCLE_STAGES.indexOf('extracting_clauses'),
    );
  });
});
