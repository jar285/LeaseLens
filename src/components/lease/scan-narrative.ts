// S19.3 — pure derivation of the two synthetic assistant messages
// that bracket a scan: the "Lease uploaded" intro and the
// scan-complete summary.
//
// Both are computed from the same `toolEvents` stream that drives
// ScanTimeline, RedFlagReport, and the scan-progress phase machine
// (see use-scan-progress.ts). Sharing the source of truth keeps the
// timeline, the right pane, and the chat narrative in lock-step.
//
// No React, no DOM, no I/O. Imports only `ToolEvent` (a plain object
// type) and the existing pure helpers from `use-scan-progress`.

import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import {
  type FollowUpPrompt,
  SCAN_COMPLETE_PROMPTS,
  SCAN_INTRO_PROMPTS,
  SCAN_PARTIAL_PROMPTS,
} from '@/lib/chat/follow-up-prompts';
import { isGradingResult, type Severity } from './grading';
import { partitionByLatestExtract } from './use-scan-progress';

export interface NarrativeLease {
  /** Stable id of the lease the scan is running against. */
  lease_id: string;
  /** Display filename surfaced in the intro copy. */
  filename: string;
}

// S20.5 — three terminal scan states. 'scan-complete' is the bright
// "everything graded cleanly" success. 'scan-partial' is the more
// honest "I reviewed what I could, some clauses couldn't be graded
// automatically" — this state replaces what used to default to
// 'scan-complete' when a few clauses errored. 'scan-fatal' kicks in
// only when 50% or more of grade attempts errored, which means the
// scan itself can't be trusted.
export type SyntheticMessageSource =
  | 'intro'
  | 'scan-complete'
  | 'scan-partial'
  | 'scan-fatal';

export interface SyntheticAssistantMessage {
  id: string;
  role: 'assistant';
  content: string;
  followUpPrompts: FollowUpPrompt[];
  /** Marks the message as client-derived (not streamed from the model). */
  synthetic: true;
  source: SyntheticMessageSource;
}

export interface ScanNarrativeOutput {
  intro: SyntheticAssistantMessage | null;
  summary: SyntheticAssistantMessage | null;
}

export interface ScanNarrativeInput {
  events: ToolEvent[];
  lease: NarrativeLease | null;
}

const SCAN_FATAL_RATIO = 0.5;

const SCAN_FATAL_PROMPTS: FollowUpPrompt[] = [
  {
    id: 'scan-fatal-try-again',
    label: 'Try again',
    prompt:
      'Try running the standard scan again. Re-extract the clauses and re-grade them against NJ tenant law.',
  },
  {
    id: 'scan-fatal-ask-clause',
    label: 'Ask about a clause',
    prompt:
      'Without re-running the full scan, list the clauses you were able to read from this lease so I can ask about a specific one.',
  },
];

/*
 * intro is shown only before the first scan-related tool event fires.
 * Once extract_clauses returns (or even before, if a grade event leaked
 * past it somehow), the intro is replaced by the ScanTimeline + the
 * eventual scan-complete summary.
 */
function hasAnyScanEvent(events: ToolEvent[]): boolean {
  return events.some(
    (e) =>
      e.tool_name === 'extract_clauses' ||
      e.tool_name === 'grade_clause_severity',
  );
}

function buildIntro(lease: NarrativeLease): SyntheticAssistantMessage {
  return {
    id: `synthetic:intro:${lease.lease_id}`,
    role: 'assistant',
    synthetic: true,
    source: 'intro',
    content:
      `Lease uploaded: **${lease.filename}**. I can run a standard scan to extract every clause, grade each against NJ tenant-law sources, and surface the red flags in the right panel. ` +
      `If you want, I can also explain a single clause, compare your lease to NJ law, or draft a negotiation email — pick whatever fits where you are right now.`,
    followUpPrompts: SCAN_INTRO_PROMPTS,
  };
}

interface ClauseInfo {
  clause_id: string;
  clause_type?: string;
}

function readExtractClauses(extractResult: unknown): ClauseInfo[] {
  if (!extractResult || typeof extractResult !== 'object') return [];
  const clauses = (extractResult as { clauses?: unknown }).clauses;
  if (!Array.isArray(clauses)) return [];
  return clauses
    .filter((c): c is { clause_id: string; clause_type?: string } => {
      if (!c || typeof c !== 'object') return false;
      const id = (c as { clause_id?: unknown }).clause_id;
      return typeof id === 'string';
    })
    .map((c) => ({ clause_id: c.clause_id, clause_type: c.clause_type }));
}

interface GradeOutcome {
  clause_id: string;
  errored: boolean;
  severity?: Severity;
  clause_type?: string;
}

/*
 * Map clause_id → outcome (success or error) for the latest scan only.
 * Mirrors `countAttemptsSince` from use-scan-progress but also surfaces
 * the severity + error flag we need for the summary tally.
 */
function readGradeOutcomesSince(
  events: ToolEvent[],
  startIndex: number,
): Map<string, GradeOutcome> {
  const outcomes = new Map<string, GradeOutcome>();
  for (let i = startIndex + 1; i < events.length; i++) {
    const event = events[i];
    if (event.tool_name !== 'grade_clause_severity') continue;
    const input = event.input as { clause_id?: unknown };
    const clauseId =
      typeof input?.clause_id === 'string' ? input.clause_id : null;
    if (clauseId === null) continue;
    if (isGradingResult(event.result)) {
      outcomes.set(clauseId, {
        clause_id: clauseId,
        errored: false,
        severity: event.result.severity,
        clause_type: event.result.clause_type,
      });
    } else {
      // A grade tool_result without a valid GradingResult body counts
      // as an error attempt — see translate-tool-error.ts. A later
      // successful retry for the same clause overwrites the error.
      const prior = outcomes.get(clauseId);
      if (!prior || prior.errored) {
        outcomes.set(clauseId, { clause_id: clauseId, errored: true });
      }
    }
  }
  return outcomes;
}

function tallySeverities(outcomes: Iterable<GradeOutcome>): {
  high: number;
  medium: number;
  low: number;
  total: number;
} {
  let high = 0;
  let medium = 0;
  let low = 0;
  for (const o of outcomes) {
    if (o.errored || !o.severity) continue;
    if (o.severity === 'high') high += 1;
    else if (o.severity === 'medium') medium += 1;
    else if (o.severity === 'low') low += 1;
    // 'ok' clauses are NOT red flags — intentionally skipped.
  }
  return { high, medium, low, total: high + medium + low };
}

function buildSummary(
  lease: NarrativeLease,
  extractIndex: number,
  outcomes: Map<string, GradeOutcome>,
): SyntheticAssistantMessage {
  const errorCount = [...outcomes.values()].filter((o) => o.errored).length;
  const attemptCount = outcomes.size;
  const errorRatio = attemptCount > 0 ? errorCount / attemptCount : 0;
  // S20.5 — three-state split:
  //   fatal:   ≥ 50% of attempts errored (scan can't be trusted)
  //   partial: 1+ errored but below the fatal threshold (graded what
  //            we could, the user should triage the rest manually)
  //   complete: zero errors (full clean success)
  const fatal = attemptCount > 0 && errorRatio >= SCAN_FATAL_RATIO;
  const partial = !fatal && errorCount > 0;

  // ID is keyed to the latest extract event so a re-scan replaces the
  // old summary instead of stacking next to it. The extractIndex
  // ensures uniqueness even when the audit_id is undefined (the
  // typeguard fallback in partitionByLatestExtract returns events
  // that may lack an audit_id during a dev-only stream).
  const id = `synthetic:scan-complete:${lease.lease_id}:${extractIndex}`;

  if (fatal) {
    return {
      id,
      role: 'assistant',
      synthetic: true,
      source: 'scan-fatal',
      content:
        "I had trouble completing the scan. I read the lease, but several clauses couldn't be graded automatically. You can try again, or ask me about a specific clause.",
      followUpPrompts: SCAN_FATAL_PROMPTS,
    };
  }

  const tally = tallySeverities(outcomes.values());
  const findingWord = tally.total === 1 ? 'finding' : 'findings';
  // Sprint 33.A.2 — minimal, deterministic receipt that POINTS to the
  // right pane (the canonical verdict headline + red-flag cards). It no
  // longer reprints the per-severity tally or the clause categories —
  // that chat-vs-cards reprint was the drift surface Sprint 33.A retired.
  // N = red-flag count (high+medium+low), matching the right-pane count
  // strip; ok-graded clauses (reviewed-and-fine) and ungraded clauses
  // (the right-pane "couldn't be graded" line) are not findings.
  const receipt = `Scan complete. ${tally.total} ${findingWord} on the right — ask me about any of them.`;

  if (partial) {
    // The partial vs complete distinction now only selects the follow-up
    // chips (partial keeps the "review skipped" action). The skipped
    // count itself lives on the right-pane ungraded line (Sprint 33.B3),
    // not in the chat receipt.
    return {
      id,
      role: 'assistant',
      synthetic: true,
      source: 'scan-partial',
      content: receipt,
      followUpPrompts: SCAN_PARTIAL_PROMPTS,
    };
  }

  return {
    id,
    role: 'assistant',
    synthetic: true,
    source: 'scan-complete',
    content: receipt,
    followUpPrompts: SCAN_COMPLETE_PROMPTS,
  };
}

export function computeScanNarrative(
  input: ScanNarrativeInput,
): ScanNarrativeOutput {
  const { events, lease } = input;
  if (!lease) return { intro: null, summary: null };

  const intro = hasAnyScanEvent(events) ? null : buildIntro(lease);

  const { extract, extractIndex } = partitionByLatestExtract(events);
  if (!extract) return { intro, summary: null };

  const clauses = readExtractClauses(extract);
  if (clauses.length === 0) return { intro, summary: null };

  const outcomes = readGradeOutcomesSince(events, extractIndex);
  // Backfill clause_type onto outcomes from the extract result when a
  // grade event didn't carry it (some legacy fixtures).
  const typeById = new Map(
    clauses.map((c) => [c.clause_id, c.clause_type] as const),
  );
  for (const [id, outcome] of outcomes) {
    if (!outcome.clause_type) {
      outcome.clause_type = typeById.get(id);
    }
  }

  // Scan is "complete" once every extracted clause has been attempted
  // at least once. Same rule as use-scan-progress.ts so the timeline
  // status and the summary message stay in lockstep.
  const attemptedIds = new Set(outcomes.keys());
  const allAttempted = clauses.every((c) => attemptedIds.has(c.clause_id));
  if (!allAttempted) return { intro, summary: null };

  return {
    intro,
    summary: buildSummary(lease, extractIndex, outcomes),
  };
}
