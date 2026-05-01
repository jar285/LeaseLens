'use client';

import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useState } from 'react';

interface ToolInvocation {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  audit_id?: string;
  compensating_available?: boolean;
}

interface ToolCardProps {
  invocation: ToolInvocation;
}

type RollbackState = 'idle' | 'rolling_back' | 'rolled_back' | 'rollback_failed';

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

export function ToolCard({ invocation }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [rollbackState, setRollbackState] = useState<RollbackState>('idle');
  const hasResult = invocation.result !== undefined;
  const hasError = invocation.error !== undefined;

  const canUndo =
    invocation.compensating_available &&
    invocation.audit_id &&
    rollbackState === 'idle';

  async function handleUndo() {
    if (!invocation.audit_id) return;
    setRollbackState('rolling_back');
    try {
      const res = await fetch(
        `/api/audit/${invocation.audit_id}/rollback`,
        { method: 'POST' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRollbackState('rolled_back');
    } catch {
      setRollbackState('rollback_failed');
    }
  }

  return (
    <div className="my-2 rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header — flex row with the expand toggle as a button and Undo/Retry
          as siblings (avoids invalid nested-button HTML). */}
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={isExpanded ? 'Collapse tool details' : 'Expand tool details'}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          <Wrench className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-medium text-gray-700">
            {invocation.name}
          </span>
        </button>

        {/* Status pills — only when not in a rollback flow.
            When rolling_back / rolled_back / rollback_failed, the new
            state pills replace the existing Done/Error/Running pill. */}
        {rollbackState === 'idle' && (
          <>
            {hasError && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                Error
              </span>
            )}
            {hasResult && !hasError && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
                Done
              </span>
            )}
            {!hasResult && !hasError && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                Running…
              </span>
            )}
          </>
        )}

        {/* Undo affordance — shown for mutating tool results in idle state */}
        {canUndo && (
          <button
            type="button"
            onClick={handleUndo}
            className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100"
          >
            Undo
          </button>
        )}
        {rollbackState === 'rolling_back' && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            Rolling back…
          </span>
        )}
        {rollbackState === 'rolled_back' && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            Rolled back
          </span>
        )}
        {rollbackState === 'rollback_failed' && (
          <button
            type="button"
            onClick={handleUndo}
            className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700"
          >
            Retry undo
          </button>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-3 py-2">
          {/* Input */}
          <div className="mb-3">
            <div className="mb-1 text-xs font-semibold text-gray-500 uppercase">
              Input
            </div>
            <pre className="max-h-32 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-700">
              {formatJson(invocation.input)}
            </pre>
          </div>

          {/* Result or Error */}
          {hasResult && (
            <div>
              <div className="mb-1 text-xs font-semibold text-gray-500 uppercase">
                Result
              </div>
              <pre
                className={`max-h-48 overflow-auto rounded p-2 text-xs ${
                  hasError
                    ? 'bg-red-50 text-red-700'
                    : 'bg-gray-50 text-gray-700'
                }`}
              >
                {formatJson(invocation.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
