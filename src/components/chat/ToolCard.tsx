'use client';

import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { useState } from 'react';

interface ToolInvocation {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

interface ToolCardProps {
  invocation: ToolInvocation;
}

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

export function ToolCard({ invocation }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasResult = invocation.result !== undefined;
  const hasError = invocation.error !== undefined;

  return (
    <div className="my-2 rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
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
        {hasError && (
          <span className="ml-auto rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
            Error
          </span>
        )}
        {hasResult && !hasError && (
          <span className="ml-auto rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-600">
            Done
          </span>
        )}
        {!hasResult && !hasError && (
          <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            Running…
          </span>
        )}
      </button>

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
