'use client';

import { useState } from 'react';

export type RollbackStatus =
  | 'idle'
  | 'rolling_back'
  | 'rolled_back'
  | 'rollback_failed';

export interface UseRollbackResult {
  status: RollbackStatus;
  rollback: () => Promise<void>;
}

/**
 * Rollback state-machine hook. Cited / extracted from
 * src/components/chat/ToolCard.tsx:27-50 (Sprint 8 inline implementation).
 * Body is byte-equivalent — Task 4 characterization-diff verifies that
 * ToolCard's observable rollback behavior is preserved after extraction.
 *
 * Lives at src/lib/audit/ (not src/lib/cockpit/) because both ToolCard
 * (chat surface) and AuditFeedPanel (cockpit surface) consume it; the
 * chat must not depend on a cockpit module — Spec §4.8.
 */
export function useRollback(auditId: string | undefined): UseRollbackResult {
  const [status, setStatus] = useState<RollbackStatus>('idle');

  async function rollback() {
    if (!auditId) return;
    setStatus('rolling_back');
    try {
      const res = await fetch(`/api/audit/${auditId}/rollback`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('rolled_back');
    } catch {
      setStatus('rollback_failed');
    }
  }

  return { status, rollback };
}
