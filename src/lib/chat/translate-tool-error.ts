// S19.2 — pure translator between raw tool errors and the friendly,
// role-aware strings the UI renders.
//
// Inputs: a `{ toolName, error, role }` triple from the chat stream.
// Outputs: a `TranslatedToolError` with
//   * `stageMessage`  — Tenant-safe plain-English (always present).
//   * `detailMessage` — one-line technical detail for Reviewer.
//   * `rawError`      — verbatim raw error for Admin.
//   * `scanFatal`     — true when this one error means the whole scan
//                       cannot continue (extract_clauses, etc.).
//
// No React, no DOM, no I/O. Pure synchronous function — fully
// unit-testable.

import type { Role } from '@/lib/auth/types';

export interface TranslatedToolError {
  stageMessage: string;
  detailMessage?: string;
  rawError?: string;
  scanFatal: boolean;
}

export interface TranslateToolErrorInput {
  toolName: string;
  error: unknown;
  role: Role;
}

// Per-tool tenant-facing copy. Keys are the literal tool names emitted
// by the chat stream's tool_use envelope; the fallback handles unknown
// tools so a new tool added server-side never crashes the UI.
const TENANT_MESSAGES: Record<string, string> = {
  grade_clause_severity:
    'I had trouble grading one clause automatically, so I skipped it and continued scanning the rest.',
  extract_clauses:
    "I couldn't read this lease cleanly. Try re-uploading it, or paste the lease text directly so I can work from that.",
  search_corpus:
    "That search took longer than expected. I'll keep working — you can also ask me about a specific clause directly.",
  draft_negotiation_email:
    "I had trouble drafting that email automatically. You can ask me to try again, or I can describe what I'd write and you can copy from there.",
  render_workflow_diagram:
    'I had trouble rendering that diagram. The underlying analysis is still good — ask me to summarise it in text instead.',
};

const TENANT_FALLBACK =
  'Something went wrong with one of the steps. I skipped it and continued.';

// extract_clauses is the only tool whose failure stops a scan dead in
// its tracks — without an extract result, there are no clause_ids to
// grade and the right-pane progress can't advance. Per-clause grading
// errors keep the scan moving (we count attempts, not successes).
const SCAN_FATAL_TOOLS = new Set(['extract_clauses']);

function normaliseError(error: unknown): string {
  if (error === undefined || error === null) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error);
}

export function translateToolError(
  input: TranslateToolErrorInput,
): TranslatedToolError {
  const { toolName, error, role } = input;
  const stageMessage = TENANT_MESSAGES[toolName] ?? TENANT_FALLBACK;
  const scanFatal = SCAN_FATAL_TOOLS.has(toolName);
  const raw = normaliseError(error);

  if (role === 'Tenant') {
    return { stageMessage, scanFatal };
  }

  if (role === 'Reviewer') {
    // Reviewer gets the friendly message + a single-line technical
    // hint. The hint format is "<toolName>: <error or 'unspecified'>"
    // so an analyst can grep the dev-log for the same tool name.
    const detail = raw ? raw : 'unspecified';
    return {
      stageMessage,
      detailMessage: `${toolName}: ${detail}`,
      scanFatal,
    };
  }

  // Admin
  return {
    stageMessage,
    rawError: raw,
    scanFatal,
  };
}
