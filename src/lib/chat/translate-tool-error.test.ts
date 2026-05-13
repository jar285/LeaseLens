// S19.2 — pure translator between raw tool errors (from the chat
// stream's `tool_result.error` field) and the friendly, role-aware
// strings the UI renders.
//
// Three audiences, three verbosity levels:
//   * Tenant — short plain-English explanation, no tool names,
//     no error stacks. Optionally a recovery hint.
//   * Reviewer — translated message + a one-line technical detail
//     so an analyst can triage without opening Admin mode.
//   * Admin — translated message + raw error verbatim for triage.
//
// This module is pure. No React, no DOM, no I/O. Inputs are a
// `{ toolName, error, role }` triple; outputs are a structured
// `TranslatedToolError` with stage-level + scan-level signals.

import { describe, expect, it } from 'vitest';
import type { Role } from '@/lib/auth/types';
import { translateToolError } from './translate-tool-error';

const TENANT: Role = 'Tenant';
const REVIEWER: Role = 'Reviewer';
const ADMIN: Role = 'Admin';

describe('translateToolError', () => {
  describe('grade_clause_severity errors', () => {
    it('Tenant gets a friendly skip message with no tool name', () => {
      const out = translateToolError({
        toolName: 'grade_clause_severity',
        error: 'Anthropic API returned 529 overloaded',
        role: TENANT,
      });
      expect(out.stageMessage.toLowerCase()).toMatch(
        /skip|trouble|continued|automatically/,
      );
      expect(out.stageMessage).not.toMatch(/grade_clause_severity/);
      expect(out.stageMessage).not.toMatch(/Anthropic|529/);
      expect(out.scanFatal).toBe(false);
      expect(out.detailMessage).toBeUndefined();
      expect(out.rawError).toBeUndefined();
    });

    it('Reviewer gets the friendly message plus a technical detail line', () => {
      const out = translateToolError({
        toolName: 'grade_clause_severity',
        error: 'Anthropic API returned 529 overloaded',
        role: REVIEWER,
      });
      expect(out.stageMessage).toBeTruthy();
      expect(out.detailMessage).toContain('grade_clause_severity');
      expect(out.detailMessage).toContain('529');
      expect(out.rawError).toBeUndefined();
    });

    it('Admin gets the raw error verbatim alongside the friendly text', () => {
      const out = translateToolError({
        toolName: 'grade_clause_severity',
        error: 'Anthropic API returned 529 overloaded',
        role: ADMIN,
      });
      expect(out.stageMessage).toBeTruthy();
      expect(out.rawError).toBe('Anthropic API returned 529 overloaded');
    });
  });

  describe('extract_clauses errors', () => {
    it('Tenant gets a re-upload hint, not a tool name', () => {
      const out = translateToolError({
        toolName: 'extract_clauses',
        error: 'PDF parse failed: unexpected EOF',
        role: TENANT,
      });
      expect(out.stageMessage.toLowerCase()).toMatch(
        /re[- ]?upload|paste|trouble.*read|couldn.?t/,
      );
      expect(out.stageMessage).not.toMatch(/extract_clauses|EOF|PDF parse/);
      // extract failure is scan-fatal — without clauses there is nothing
      // to grade, so the timeline cannot make progress.
      expect(out.scanFatal).toBe(true);
    });
  });

  describe('search_corpus errors', () => {
    it('Tenant gets a generic timeout-style message', () => {
      const out = translateToolError({
        toolName: 'search_corpus',
        error: 'fetch timeout after 10000ms',
        role: TENANT,
      });
      expect(out.stageMessage.toLowerCase()).toMatch(
        /trouble|longer than|try|search/,
      );
      expect(out.stageMessage).not.toMatch(/search_corpus|fetch timeout/);
      expect(out.scanFatal).toBe(false);
    });
  });

  describe('unknown tools', () => {
    it('Tenant gets a generic safe fallback message', () => {
      const out = translateToolError({
        toolName: 'totally_made_up_tool',
        error: 'kaboom',
        role: TENANT,
      });
      expect(out.stageMessage).toBeTruthy();
      expect(out.stageMessage).not.toMatch(/totally_made_up_tool|kaboom/);
      expect(out.scanFatal).toBe(false);
    });

    it('Admin still gets the raw error for an unknown tool', () => {
      const out = translateToolError({
        toolName: 'totally_made_up_tool',
        error: 'kaboom',
        role: ADMIN,
      });
      expect(out.rawError).toBe('kaboom');
    });
  });

  describe('error normalisation', () => {
    it('handles Error instances as well as strings (Anthropic SDK returns either)', () => {
      const out = translateToolError({
        toolName: 'grade_clause_severity',
        error: new Error('Anthropic API returned 529 overloaded'),
        role: ADMIN,
      });
      expect(out.rawError).toContain('529');
    });

    it('handles undefined / empty errors gracefully', () => {
      const out = translateToolError({
        toolName: 'grade_clause_severity',
        error: undefined,
        role: TENANT,
      });
      expect(out.stageMessage).toBeTruthy();
      expect(out.scanFatal).toBe(false);
    });
  });

  describe('scanFatal flag', () => {
    it('is false for a single graded-clause failure (the scan can continue)', () => {
      const out = translateToolError({
        toolName: 'grade_clause_severity',
        error: 'one clause failed',
        role: TENANT,
      });
      expect(out.scanFatal).toBe(false);
    });

    it('is true when extract_clauses fails (no clauses → no scan)', () => {
      const out = translateToolError({
        toolName: 'extract_clauses',
        error: 'PDF unreadable',
        role: TENANT,
      });
      expect(out.scanFatal).toBe(true);
    });
  });
});
