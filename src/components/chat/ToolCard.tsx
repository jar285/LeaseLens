'use client';

import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useRollback } from '@/lib/audit/use-rollback';
import type { ToolInvocation } from './ChatMessage';

interface ToolCardProps {
  invocation: ToolInvocation;
}

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

export function ToolCard({ invocation }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { status: rollbackState, rollback: handleUndo } = useRollback(
    invocation.audit_id,
  );
  const hasResult = invocation.result !== undefined;
  const hasError = invocation.error !== undefined;
  const isPending = !hasResult && !hasError;

  const canUndo =
    invocation.compensating_available &&
    invocation.audit_id &&
    rollbackState === 'idle';

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header — flex row with the expand toggle as a button and Undo/Retry
          as siblings (avoids invalid nested-button HTML). */}
      <div className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-gray-50">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={
            isExpanded ? 'Collapse tool details' : 'Expand tool details'
          }
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400" />
          )}
          <Wrench className="h-4 w-4 text-indigo-500" />
          <span className="truncate text-sm font-medium text-gray-700">
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
            {isPending && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                Running...
              </span>
            )}
          </>
        )}

        {/* Undo affordance — shown for mutating tool results in idle state */}
        {canUndo && (
          <button
            type="button"
            onClick={handleUndo}
            className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
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
            className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
          >
            Retry undo
          </button>
        )}
      </div>

      {isPending && (
        <div
          role="status"
          className="border-t border-gray-100 px-3 py-2.5 text-xs text-gray-500"
        >
          <span className="sr-only">Tool is running</span>
          <div className="space-y-1.5" aria-hidden="true">
            <div className="h-2 w-2/3 animate-pulse rounded bg-gray-100" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-gray-100" />
            <div className="h-2 w-3/4 animate-pulse rounded bg-gray-100" />
          </div>
        </div>
      )}

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
