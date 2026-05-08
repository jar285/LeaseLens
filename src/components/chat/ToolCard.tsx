'use client';

import { ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useRollback } from '@/lib/audit/use-rollback';
import type { ToolInvocation } from './ChatMessage';
import { MermaidDiagram } from './MermaidDiagram';

interface ToolCardProps {
  invocation: ToolInvocation;
}

interface DiagramResult {
  code: string;
  diagram_type?: string;
  title?: string;
  caption?: string;
}

function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

function isDiagramResult(result: unknown): result is DiagramResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    typeof (result as { code?: unknown }).code === 'string'
  );
}

export function ToolCard({ invocation }: ToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = useReducedMotion();
  const animate = mounted && !reduced;

  const { status: rollbackState, rollback: handleUndo } = useRollback(
    invocation.audit_id,
  );
  const hasResult = invocation.result !== undefined;
  const hasError = invocation.error !== undefined;
  const isPending = !hasResult && !hasError;

  const isDiagramInvocation =
    invocation.name === 'render_workflow_diagram' &&
    hasResult &&
    !hasError &&
    isDiagramResult(invocation.result);
  const diagramResult = isDiagramInvocation
    ? (invocation.result as DiagramResult)
    : null;

  const canUndo =
    invocation.compensating_available &&
    invocation.audit_id &&
    rollbackState === 'idle';

  // Sprint 15 Phase 6 — hairline border (replaces shadow-sm bloom),
  // 2px hover lift via motion, and semantic-token status badges.
  const card = (
    <>
      {/* Header — flex row with the expand toggle as a button and Undo/Retry
          as siblings (avoids invalid nested-button HTML). */}
      <div className="flex items-center gap-2 px-3 py-2 transition-colors hover:bg-surface-muted dark:hover:bg-neutral-800/50">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-label={
            isExpanded ? 'Collapse tool details' : 'Expand tool details'
          }
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-fg-subtle" />
          ) : (
            <ChevronRight className="h-4 w-4 text-fg-subtle" />
          )}
          <Wrench className="h-4 w-4 text-accent-500 dark:text-accent-300" />
          <span className="truncate text-sm font-medium text-fg-default">
            {invocation.name}
          </span>
        </button>

        {/* Status pills — only when not in a rollback flow.
            When rolling_back / rolled_back / rollback_failed, the new
            state pills replace the existing Done/Error/Running pill. */}
        {rollbackState === 'idle' && (
          <>
            {hasError && (
              <span className="rounded-full bg-danger-100 px-2 py-0.5 text-xs text-danger-600 dark:bg-danger-600/15 dark:text-danger-100">
                Error
              </span>
            )}
            {hasResult && !hasError && (
              <span className="rounded-full bg-success-100 px-2 py-0.5 text-xs text-success-600 dark:bg-success-600/15 dark:text-success-100">
                Done
              </span>
            )}
            {isPending && (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
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
            className="rounded-full border border-warning-100 bg-warning-100/60 px-2 py-0.5 text-xs text-warning-600 transition-colors hover:bg-warning-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-warning-600/40 dark:bg-warning-600/15 dark:text-warning-100"
          >
            Undo
          </button>
        )}
        {rollbackState === 'rolling_back' && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            Rolling back…
          </span>
        )}
        {rollbackState === 'rolled_back' && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-fg-muted dark:bg-neutral-800">
            Rolled back
          </span>
        )}
        {rollbackState === 'rollback_failed' && (
          <button
            type="button"
            onClick={handleUndo}
            className="rounded-full border border-danger-100 bg-danger-100/60 px-2 py-0.5 text-xs text-danger-600 transition-colors hover:bg-danger-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:border-danger-600/40 dark:bg-danger-600/15 dark:text-danger-100"
          >
            Retry undo
          </button>
        )}
      </div>

      {isPending && (
        <div
          role="status"
          className="border-t border-neutral-100 px-3 py-2.5 text-xs text-fg-muted dark:border-neutral-800"
        >
          <span className="sr-only">Tool is running</span>
          <div className="space-y-1.5" aria-hidden="true">
            <div className="h-2 w-2/3 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-2 w-3/4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
        </div>
      )}

      {/* Sprint 12: render the diagram inline above the collapsible
          details when the tool result carries Mermaid code. */}
      {diagramResult && (
        <div className="border-t border-neutral-100 px-3 py-2 dark:border-neutral-800">
          <MermaidDiagram
            code={diagramResult.code}
            title={diagramResult.title}
            caption={diagramResult.caption}
          />
        </div>
      )}

      {/* Expanded content — `AnimatePresence` smooths the height
          transition. Reduced-motion drops to a plain div with no
          animation props (data-motion="off"). */}
      <AnimatePresence initial={false}>
        {isExpanded &&
          (animate ? (
            <motion.div
              key="body"
              data-testid="expanded-body"
              data-motion="on"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="border-t border-neutral-100 px-3 py-2 dark:border-neutral-800">
                {/* Input */}
                <div className="mb-3">
                  <div className="mb-1 text-xs font-semibold text-fg-muted uppercase">
                    Input
                  </div>
                  <pre className="max-h-32 overflow-auto rounded bg-surface-muted p-2 text-xs text-fg-default dark:bg-neutral-800">
                    {formatJson(invocation.input)}
                  </pre>
                </div>

                {/* Result or Error */}
                {hasResult && (
                  <div>
                    <div className="mb-1 text-xs font-semibold text-fg-muted uppercase">
                      Result
                    </div>
                    <pre
                      className={`max-h-48 overflow-auto rounded p-2 text-xs ${
                        hasError
                          ? 'bg-danger-100/60 text-danger-600 dark:bg-danger-600/15 dark:text-danger-100'
                          : 'bg-surface-muted text-fg-default dark:bg-neutral-800'
                      }`}
                    >
                      {formatJson(invocation.result)}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <div key="body" data-testid="expanded-body" data-motion="off">
              <div className="border-t border-neutral-100 px-3 py-2 dark:border-neutral-800">
                <div className="mb-3">
                  <div className="mb-1 text-xs font-semibold text-fg-muted uppercase">
                    Input
                  </div>
                  <pre className="max-h-32 overflow-auto rounded bg-surface-muted p-2 text-xs text-fg-default dark:bg-neutral-800">
                    {formatJson(invocation.input)}
                  </pre>
                </div>
                {hasResult && (
                  <div>
                    <div className="mb-1 text-xs font-semibold text-fg-muted uppercase">
                      Result
                    </div>
                    <pre
                      className={`max-h-48 overflow-auto rounded p-2 text-xs ${
                        hasError
                          ? 'bg-danger-100/60 text-danger-600 dark:bg-danger-600/15 dark:text-danger-100'
                          : 'bg-surface-muted text-fg-default dark:bg-neutral-800'
                      }`}
                    >
                      {formatJson(invocation.result)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
      </AnimatePresence>
    </>
  );

  const containerClass =
    'my-2 overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-hairline dark:border-neutral-800 dark:bg-neutral-900';

  return animate ? (
    <motion.div
      className={containerClass}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
    >
      {card}
    </motion.div>
  ) : (
    <div className={containerClass}>{card}</div>
  );
}
