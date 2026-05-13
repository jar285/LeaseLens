// S19.7 — inline ActivityDrawer.
//
// Tenant-mode "Show what I did" affordance: an inline expansion that
// renders one ToolCard per raw tool invocation in chronological order.
// The drawer is pure presentation — no business logic — so this file
// tests the rendering contract and the open/closed states.
//
// Focus management and the toggle-button wiring live in
// ScanTimeline.test.tsx where the drawer is opened from.

import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ActivityDrawer } from './ActivityDrawer';
import type { ToolInvocation } from './ChatMessage';
import { withChatStream } from './test-helpers';

afterEach(cleanup);

const INVOCATIONS: ToolInvocation[] = [
  {
    id: 'inv-1',
    name: 'extract_clauses',
    input: { lease_id: 'lease-1' },
    result: { clauses: [{ clause_id: 'c1' }] },
  },
  {
    id: 'inv-2',
    name: 'grade_clause_severity',
    input: { clause_id: 'c1' },
    result: {
      clause_id: 'c1',
      severity: 'high',
      statute_citation: 'NJSA 46:8-1',
      chunk_id: 'k',
      reasoning: 'r',
      recommended_action: 'a',
    },
  },
];

describe('ActivityDrawer', () => {
  it('returns null when open is false (no DOM emitted)', () => {
    const { container } = render(
      withChatStream(
        <ActivityDrawer open={false} invocations={INVOCATIONS} id="drawer-1" />,
      ),
    );
    expect(
      container.querySelector('[data-testid="activity-drawer"]'),
    ).toBeNull();
  });

  it('returns null when invocations are empty even if open is true', () => {
    render(
      withChatStream(
        <ActivityDrawer open={true} invocations={[]} id="drawer-1" />,
      ),
    );
    expect(screen.queryByTestId('activity-drawer')).not.toBeInTheDocument();
  });

  it('renders one ToolCard per invocation when open', () => {
    render(
      withChatStream(
        <ActivityDrawer open={true} invocations={INVOCATIONS} id="drawer-1" />,
      ),
    );
    const drawer = screen.getByTestId('activity-drawer');
    expect(drawer).toBeInTheDocument();
    // Each ToolCard renders the tool name as a visible span (the
    // header button's aria-label is the generic expand/collapse,
    // not the tool name).
    expect(screen.getByText('extract_clauses')).toBeInTheDocument();
    expect(screen.getByText('grade_clause_severity')).toBeInTheDocument();
  });

  it('renders the cards in chronological order (input order preserved)', () => {
    render(
      withChatStream(
        <ActivityDrawer open={true} invocations={INVOCATIONS} id="drawer-1" />,
      ),
    );
    const extract = screen.getByText('extract_clauses');
    const grade = screen.getByText('grade_clause_severity');
    expect(
      extract.compareDocumentPosition(grade) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('exposes the provided `id` on the root so aria-controls can wire to it', () => {
    render(
      withChatStream(
        <ActivityDrawer open={true} invocations={INVOCATIONS} id="my-drawer" />,
      ),
    );
    expect(screen.getByTestId('activity-drawer').id).toBe('my-drawer');
  });

  it('renders as a landmark <section> with an aria-label so SRs announce the expansion', () => {
    render(
      withChatStream(
        <ActivityDrawer open={true} invocations={INVOCATIONS} id="d" />,
      ),
    );
    const drawer = screen.getByTestId('activity-drawer');
    // A <section aria-label="..."> exposes role="region" implicitly,
    // so use the accessible-role query rather than getAttribute.
    expect(drawer.tagName).toBe('SECTION');
    expect(drawer.getAttribute('aria-label')).toMatch(/activity|technical/i);
    expect(screen.getByRole('region', { name: /activity|technical/i })).toBe(
      drawer,
    );
  });
});
