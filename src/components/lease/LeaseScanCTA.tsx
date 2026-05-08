// Sprint 13 §3f — empty-state replacement when active_lease_id is set
// and the conversation has no messages yet. Single button posts the
// synthetic user message on the user's behalf so the demo guardrails
// trip on a deliberate user action.

'use client';

import type { CSSProperties } from 'react';

export interface LeaseScanCTAProps {
  leaseId: string;
  pageCount: number;
  onScan: (leaseId: string) => void;
}

const wrapperStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  padding: '1.5rem',
  border: '1px solid rgba(0, 0, 0, 0.1)',
  borderRadius: '0.75rem',
  background: 'rgba(0, 0, 0, 0.02)',
};

const buttonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: '0.5rem 1rem',
  borderRadius: '0.5rem',
  border: '1px solid rgba(0, 0, 0, 0.2)',
  background: '#111',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 500,
};

export function LeaseScanCTA({
  leaseId,
  pageCount,
  onScan,
}: LeaseScanCTAProps): React.JSX.Element {
  return (
    <div style={wrapperStyle} data-testid="lease-scan-cta">
      <p style={{ margin: 0, lineHeight: 1.5 }}>
        Want me to scan this <strong>{pageCount}-page</strong> lease? I'll
        extract clauses, grade each against NJ tenant law, and draft negotiation
        emails for any red flags.
      </p>
      <button type="button" style={buttonStyle} onClick={() => onScan(leaseId)}>
        Run the standard scan
      </button>
    </div>
  );
}
