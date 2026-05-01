# Sprint Plan — Sprint 9: Operator Cockpit Dashboard + Typing Indicator

**Sprint:** 9
**Status:** QA-revised
**Date:** 2026-05-01 (drafted), 2026-05-01 (sprint-QA fixes applied)
**Spec:** [spec.md](spec.md) (status: QA-revised; sprint-QA amended)

---

## Prerequisites

Before any implementation step:

1. Confirm Sprint 8 is fully committed and clean: `git log --oneline -1` should show the Sprint 8 commit `feat(s8)`. `git status` should be clean.
2. Run `npm run test` — must show **132 passing** (Sprint 8 baseline).
3. Run `npm run test:e2e` — must show **1 spec passing** (`chat-tool-use.spec.ts`).
4. Run `npm run eval:golden` — must show **5/5 passing**.
5. Run `npm run typecheck` — **0 errors**. Run `npm run lint` — pre-existing Sprint 7-era format issues are documented out-of-scope debt; do not fix in Sprint 9.
6. Verify `.env.local` exists and contains `CONTENTOPS_DB_PATH`, `CONTENTOPS_SESSION_SECRET` (≥32 chars), `ANTHROPIC_API_KEY`, and `CONTENTOPS_DAILY_SPEND_CEILING_USD` (the spend panel doesn't read this directly, but the existing `isSpendCeilingExceeded` does and the Sprint 9 prerequisite preflight confirms the env still parses).
7. Library API surfaces verified via Context7 against the pinned versions:
   - `@vercel/next.js` v16.2.2 — `'use server'` directive at top of module exports each function as an RPC endpoint; `redirect` from `next/navigation` for server-component redirects; `<Link>` from `next/link`; `export const runtime = 'nodejs'` accepted on both page modules and `'use server'` modules. Async `params: Promise<{ ... }>` not relevant for Sprint 9 (no new dynamic routes).
   - `@wiselibs/better-sqlite3` — `LEFT JOIN` syntax is standard SQLite (no library-version concerns); `date('now')` returns UTC `YYYY-MM-DD` (no library-version concerns).
   - `@microsoft/playwright` — `defineConfig` and `context.addCookies` shape unchanged from Sprint 8 use.
   - `tailwindcss` v4.2.4 — `animate-bounce` utility present in `node_modules/tailwindcss/theme.css`. No plugin required.
8. Confirm the **132-baseline** test count by tier so post-impl drift is visible:
   - Vitest: 132
   - Playwright: 1 spec
   - Eval: 5/5

---

## Task List

| # | Task | Files | Type |
|---|---|---|---|
| 1 | Pricing-source citation comment in `spend.ts` | `src/lib/db/spend.ts` | Modify |
| 2 | Cockpit domain types | `src/lib/cockpit/types.ts` | Create |
| 3 | `useRollback` hook + tests (TDD) | `src/lib/audit/use-rollback.ts`, `src/lib/audit/use-rollback.test.ts` | Create |
| 4 | `ToolCard.tsx` refactor — consume `useRollback`; drop local `ToolInvocation` duplicate. **Characterization-test discipline.** | `src/components/chat/ToolCard.tsx` | Modify |
| 5 | `TypingIndicator` component + tests (TDD) | `src/components/chat/TypingIndicator.tsx`, `src/components/chat/TypingIndicator.test.tsx` | Create |
| 6 | `ChatMessage.tsx` — add `isStreaming?` prop; render `<TypingIndicator>` under four-clause condition | `src/components/chat/ChatMessage.tsx`, `src/components/chat/ChatMessage.test.tsx` | Modify (component) + Create (test) |
| 7 | `ChatTranscript.tsx` — destructure `isStreaming`; thread to last message | `src/components/chat/ChatTranscript.tsx` | Modify |
| 8 | `ChatUI.tsx` — remove "Composing response…" overlay | `src/components/chat/ChatUI.tsx` | Modify |
| 9 | Eval-reports filesystem reader + tests | `src/lib/cockpit/eval-reports.ts`, `src/lib/cockpit/eval-reports.test.ts` | Create |
| 10 | Cockpit DB queries + tests (LEFT JOIN audit, `date('now')` spend) | `src/lib/cockpit/queries.ts`, `src/lib/cockpit/queries.test.ts` | Create |
| 11 | Server actions module + tests *(moved up from Task 18 — sprint-QA H1: panels at Tasks 13-17 import this module; typecheck would fail otherwise)* | `src/app/cockpit/actions.ts`, `src/app/cockpit/actions.test.ts` | Create |
| 12 | `<RefreshButton>` micro-component | `src/components/cockpit/RefreshButton.tsx` | Create |
| 13 | `<AuditFeedPanel>` + tests (Undo via `useRollback`; mcp-server fallback) | `src/components/cockpit/AuditFeedPanel.tsx`, `src/components/cockpit/AuditFeedPanel.test.tsx` | Create |
| 14 | `<SchedulePanel>` + tests | `src/components/cockpit/SchedulePanel.tsx`, `src/components/cockpit/SchedulePanel.test.tsx` | Create |
| 15 | `<ApprovalsPanel>` + tests | `src/components/cockpit/ApprovalsPanel.tsx`, `src/components/cockpit/ApprovalsPanel.test.tsx` | Create |
| 16 | `<EvalHealthPanel>` + tests (null / green / amber) | `src/components/cockpit/EvalHealthPanel.tsx`, `src/components/cockpit/EvalHealthPanel.test.tsx` | Create |
| 17 | `<SpendPanel>` + tests | `src/components/cockpit/SpendPanel.tsx`, `src/components/cockpit/SpendPanel.test.tsx` | Create |
| 18 | `<CockpitDashboard>` top-level client component (conditional ApprovalsPanel) | `src/components/cockpit/CockpitDashboard.tsx` | Create |
| 19 | Cockpit layout + page (server component) + page tests | `src/app/cockpit/layout.tsx`, `src/app/cockpit/page.tsx`, `src/app/cockpit/page.test.tsx` | Create |
| 20 | `src/app/page.tsx` — add Cockpit link; remove `sprint-3` chip | `src/app/page.tsx` | Modify |
| 21 | Extend chat-tool-use E2E with typing-indicator assertion | `tests/e2e/chat-tool-use.spec.ts` | Modify |
| 22 | Cockpit dashboard E2E smoke spec | `tests/e2e/cockpit-dashboard.spec.ts` | Create |
| 23 | Final verification — typecheck, lint, test, eval:golden, test:e2e, mcp:server | — | Verify |

After each task's *Verification* block passes, move to the next task. Do not batch task completion. Sprint 8 §10.3-style characterization discipline applies wherever a task touches a Sprint 7/8 file (notably Task 4 — `ToolCard.tsx`).

---

## Task 1 — `src/lib/db/spend.ts`

**Spec:** §4.7, §11 Modified, §17 risk row "Pricing constants drift…"

**Goal:** Add a one-line citation comment above the `HAIKU_*_COST_PER_MTOK` constants pointing at the Anthropic pricing page. **No constant value change.** This makes the operator-editable single source of truth self-documenting and closes spec QA finding L5.

**Edit:**

Above [src/lib/db/spend.ts:4-5](src/lib/db/spend.ts#L4-L5), insert:

```typescript
// Pricing source: https://www.anthropic.com/pricing
// Demo display only — verify against current pricing before any production claim.
// Reused by isSpendCeilingExceeded (chat route guard) and the Sprint 9 cockpit
// SpendPanel via estimateCost. Single source of truth — do not duplicate.
const HAIKU_INPUT_COST_PER_MTOK = 0.8;
const HAIKU_OUTPUT_COST_PER_MTOK = 4.0;
```

No other change to this file.

**Verification:**

```bash
npm run typecheck    # 0 errors
npm run test -- src/lib/db/spend.test.ts    # existing spend tests still pass
```

---

## Task 2 — `src/lib/cockpit/types.ts`

**Spec:** §5

**Goal:** Cockpit-only domain types. No runtime code; type-only module.

**Create:**

```typescript
import type { Role } from '@/lib/auth/types';
import type { AuditLogEntry } from '@/lib/tools/domain';

/**
 * Cockpit projection of audit_log rows. Augments AuditLogEntry with the
 * actor display name resolved via LEFT JOIN users (Spec §4.3 audit-feed
 * query shape). The base AuditLogEntry in src/lib/tools/domain.ts is
 * unchanged — Sprint 8 ABI preserved.
 *
 * actor_display_name is null for rows whose actor_user_id has no match in
 * users — notably MCP-originated rows where actor_user_id = 'mcp-server'.
 * The cockpit AuditFeedPanel falls back to rendering actor_user_id literal
 * in that case (Spec §6.2).
 */
export interface CockpitAuditRow extends AuditLogEntry {
  actor_display_name: string | null;
}

export interface ScheduledItem {
  id: string;
  document_slug: string;
  scheduled_for: number;     // Unix seconds, per Sprint 8 §6.1
  channel: string;
  scheduled_by: string;
  created_at: number;
}

export interface ApprovalRecord {
  id: string;
  document_slug: string;
  approved_by: string;
  notes: string | null;
  created_at: number;
}

export interface SpendSnapshot {
  date: string;              // YYYY-MM-DD as written by SQLite date('now') (UTC)
  tokens_in: number;
  tokens_out: number;
  estimated_dollars: number; // computed via estimateCost from src/lib/db/spend.ts
}

export interface EvalHealthSnapshot {
  passedCount: number;
  totalCases: number;
  totalScore: number;
  maxScore: number;
  lastRunAt: string;         // report.completedAt (ISO 8601)
  reportPath: string;        // server-side debug only — not exposed to client
}

export interface CockpitInitialData {
  recentAudit: CockpitAuditRow[];
  scheduled: ScheduledItem[];
  /** Empty array for Editor sessions (panel hidden). Spec §4.5 / §6.4. */
  approvals: ApprovalRecord[];
  evalHealth: EvalHealthSnapshot | null;
  spend: SpendSnapshot;
  role: Role;
  userId: string;
}
```

**Verification:**

```bash
npm run typecheck    # 0 errors — confirms imports resolve and Role / AuditLogEntry types exist
```

---

## Task 3 — `src/lib/audit/use-rollback.ts` + tests

**Spec:** §4.8, §12.3

**Goal:** Extract the rollback state machine from [ToolCard.tsx:20-50](src/components/chat/ToolCard.tsx#L20-L50) into a reusable hook. Lives at `src/lib/audit/` (not `src/lib/cockpit/`) per spec §4.8 — both chat (`ToolCard`) and cockpit (`AuditFeedPanel`) consume it; the chat shouldn't depend on a cockpit module.

**TDD order.** Write `use-rollback.test.ts` first; implementations land afterward.

### 3.1 Test file — `src/lib/audit/use-rollback.test.ts`

Three tests per spec §12.3:

```typescript
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRollback } from './use-rollback';

describe('useRollback', () => {
  beforeEach(() => {
    window.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initial state is idle', () => {
    const { result } = renderHook(() => useRollback('audit-1'));
    expect(result.current.status).toBe('idle');
  });

  it('successful POST transitions idle → rolling_back → rolled_back', async () => {
    (window.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ rolled_back: true }), { status: 200 }),
    );
    const { result } = renderHook(() => useRollback('audit-1'));
    await act(async () => {
      await result.current.rollback();
    });
    expect(window.fetch).toHaveBeenCalledWith(
      '/api/audit/audit-1/rollback',
      { method: 'POST' },
    );
    expect(result.current.status).toBe('rolled_back');
  });

  it('failed POST transitions to rollback_failed; retry returns to idle then rolled_back', async () => {
    (window.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ rolled_back: true }), { status: 200 }),
      );
    const { result } = renderHook(() => useRollback('audit-1'));
    await act(async () => {
      await result.current.rollback();
    });
    expect(result.current.status).toBe('rollback_failed');
    await act(async () => {
      await result.current.rollback();
    });
    await waitFor(() => expect(result.current.status).toBe('rolled_back'));
  });
});
```

### 3.2 Hook — `src/lib/audit/use-rollback.ts`

**Cite and copy.** The state-machine logic is byte-equivalent to [ToolCard.tsx:27-50](src/components/chat/ToolCard.tsx#L27-L50). Copy it; do not paraphrase. The Task 4 characterization step verifies that `ToolCard`'s observable behavior is unchanged.

```typescript
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

export function useRollback(auditId: string | undefined): UseRollbackResult {
  const [status, setStatus] = useState<RollbackStatus>('idle');

  async function rollback() {
    if (!auditId) return;
    setStatus('rolling_back');
    try {
      const res = await fetch(`/api/audit/${auditId}/rollback`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus('rolled_back');
    } catch {
      setStatus('rollback_failed');
    }
  }

  return { status, rollback };
}
```

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/audit/use-rollback.test.ts    # 3 passing
```

---

## Task 4 — `src/components/chat/ToolCard.tsx` refactor

**Spec:** §4.8, §9.5, §12.12 (characterization discipline)

**Goal:**
1. Replace the inline rollback state machine ([ToolCard.tsx:20-50](src/components/chat/ToolCard.tsx#L20-L50)) with `useRollback`.
2. Delete the local `interface ToolInvocation` ([ToolCard.tsx:6-14](src/components/chat/ToolCard.tsx#L6-L14)) and import the exported type from `ChatMessage.tsx`.

**Characterization-test discipline (mandatory).** Sprint 8 ToolCard tests must produce byte-identical assertion outputs before and after the edit.

**Steps:**

Use a project-relative `tmp/` directory for the diff files (gitignored — verify or add to `.gitignore` before running). Both bash-style `>` redirection and PowerShell-equivalent commands are documented below since contributors may use either shell:

1. **Capture before-output.**

    Bash / Git Bash:
    ```bash
    mkdir -p tmp
    npm run test -- src/components/chat/ToolCard.test.tsx > tmp/toolcard-before.txt 2>&1
    ```

    PowerShell:
    ```powershell
    New-Item -ItemType Directory -Force tmp | Out-Null
    npm run test -- src/components/chat/ToolCard.test.tsx 2>&1 | Tee-Object -FilePath tmp/toolcard-before.txt
    ```

2. Apply edits to `ToolCard.tsx`:
   - Remove lines 6-14 (`interface ToolInvocation { ... }`).
   - Add `import { ToolInvocation } from './ChatMessage';` near the existing imports.
   - Remove lines 20 (`type RollbackState`), 28 (`useState<RollbackState>(...)`), and 37-50 (`async function handleUndo`).
   - Add `import { useRollback } from '@/lib/audit/use-rollback';`.
   - Inside the component body, replace the removed state and function with:

     ```typescript
     const { status: rollbackState, rollback: handleUndo } = useRollback(invocation.audit_id);
     ```

   - All references to `setRollbackState(...)` are gone; the local function `handleUndo` is now the hook's `rollback`. JSX is unchanged — the rendered output uses the same variable names.

3. **Capture after-output.**

    Bash / Git Bash:
    ```bash
    npm run test -- src/components/chat/ToolCard.test.tsx > tmp/toolcard-after.txt 2>&1
    ```

    PowerShell:
    ```powershell
    npm run test -- src/components/chat/ToolCard.test.tsx 2>&1 | Tee-Object -FilePath tmp/toolcard-after.txt
    ```

4. **Diff.**

    Bash / Git Bash (Git Bash on Windows ships `diff`):
    ```bash
    diff tmp/toolcard-before.txt tmp/toolcard-after.txt
    ```

    PowerShell fallback if `diff` is not available:
    ```powershell
    Compare-Object (Get-Content tmp/toolcard-before.txt) (Get-Content tmp/toolcard-after.txt)
    ```

   The only differences allowed are timing values (e.g., "12ms" vs "13ms") and the test-file path if any line shows it. Assertion text and counts must be identical.

If the diff shows assertion-text differences, **stop**: the refactor changed observable behavior. Investigate before proceeding.

**Verification:**

```bash
npm run typecheck
npm run test -- src/components/chat/ToolCard.test.tsx    # all existing tests still pass
npm run test -- src/lib/audit/use-rollback.test.ts       # 3 passing (Task 3)
```

---

## Task 5 — `src/components/chat/TypingIndicator.tsx` + tests

**Spec:** §7, §12.1

**TDD order.** Write `TypingIndicator.test.tsx` first.

### 5.1 Test file — `src/components/chat/TypingIndicator.test.tsx`

```typescript
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TypingIndicator } from './TypingIndicator';

describe('TypingIndicator', () => {
  it('renders three animate-bounce spans with staggered delays', () => {
    const { container } = render(<TypingIndicator />);
    const spans = container.querySelectorAll('span.animate-bounce');
    expect(spans).toHaveLength(3);
    const delays = Array.from(spans).map((s) =>
      (s as HTMLElement).style.animationDelay,
    );
    expect(delays).toEqual(['0ms', '150ms', '300ms']);
  });

  it('exposes role=status and aria-label for screen readers', () => {
    render(<TypingIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Assistant is composing');
  });
});
```

### 5.2 Component — `src/components/chat/TypingIndicator.tsx`

```tsx
export function TypingIndicator() {
  return (
    <div
      role="status"
      aria-label="Assistant is composing"
      className="flex items-center gap-1.5 py-2"
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}
```

**Verification:**

```bash
npm run typecheck
npm run test -- src/components/chat/TypingIndicator.test.tsx    # 2 passing
```

---

## Task 6 — `src/components/chat/ChatMessage.tsx`

**Spec:** §4.9 (four-clause condition), §9.3, §12.8

**Goal:** Add `isStreaming?: boolean` prop; conditionally render `<TypingIndicator>` per the four-clause condition.

**Edits:**

1. Update `ChatMessageProps`:

    ```typescript
    export interface ChatMessageProps {
      id: string;
      role: 'user' | 'assistant';
      content: string;
      toolInvocations?: ToolInvocation[];
      isStreaming?: boolean;
    }
    ```

2. Destructure `isStreaming` in the function signature.
3. Replace the existing content-render block (lines 60-65 of current file, the `{content && (...)}` JSX) with:

    ```tsx
    {!content && isStreaming && role === 'assistant' && (!toolInvocations || toolInvocations.length === 0) ? (
      <TypingIndicator />
    ) : content ? (
      <div className="wrap-break-word text-[14.5px] leading-[1.7] text-gray-600">
        {isUser ? content : renderMarkdown(content)}
      </div>
    ) : null}
    ```

4. Add `import { TypingIndicator } from './TypingIndicator';` at top.

### 6.1 Add three tests in `src/components/chat/ChatMessage.test.tsx`

If `ChatMessage.test.tsx` does not exist yet, create it with the three tests below. If it exists, append.

```typescript
it('renders TypingIndicator for empty streaming assistant message with no tool invocations', () => {
  render(<ChatMessage id="m1" role="assistant" content="" isStreaming />);
  expect(screen.getByRole('status', { name: 'Assistant is composing' })).toBeInTheDocument();
});

it('renders markdown content when content is present, regardless of isStreaming', () => {
  render(<ChatMessage id="m1" role="assistant" content="hi" isStreaming />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('hi')).toBeInTheDocument();
});

it('does NOT render TypingIndicator when a tool invocation is in flight (Spec §4.9 four-clause)', () => {
  render(
    <ChatMessage
      id="m1"
      role="assistant"
      content=""
      isStreaming
      toolInvocations={[{ id: 't1', name: 'schedule_content_item', input: {} }]}
    />,
  );
  expect(screen.queryByRole('status', { name: 'Assistant is composing' })).not.toBeInTheDocument();
});
```

**Verification:**

```bash
npm run typecheck
npm run test -- src/components/chat/ChatMessage.test.tsx    # 3 new tests pass
```

---

## Task 7 — `src/components/chat/ChatTranscript.tsx`

**Spec:** §4.9, §9.2

**Goal:** Destructure the `isStreaming` prop (currently received but ignored at [ChatTranscript.tsx:10](src/components/chat/ChatTranscript.tsx#L10)) and thread it to the last assistant message only.

**Edit:**

Replace the function signature and the `messages.map(...)` block:

```tsx
export function ChatTranscript({ messages, isStreaming = false }: ChatTranscriptProps) {
  // ... existing scroll logic unchanged ...

  return (
    <div /* ... existing wrapper ... */>
      <div className="mx-auto w-full max-w-3xl shrink-0">
        <ul className="m-0 list-none space-y-1 p-0 pb-4">
          {messages.map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              {...msg}
              isStreaming={
                isStreaming &&
                idx === messages.length - 1 &&
                msg.role === 'assistant'
              }
            />
          ))}
          <div data-testid="transcript-bottom" className="h-1" />
        </ul>
      </div>
    </div>
  );
}
```

No other change. The `isStreaming` prop was already passed by `ChatUI` ([ChatUI.tsx:207](src/components/chat/ChatUI.tsx#L207)); this task wires the consumer side only.

**Verification:**

```bash
npm run typecheck
npm run test -- src/components/chat    # all chat-component tests still pass
```

---

## Task 8 — `src/components/chat/ChatUI.tsx`

**Spec:** §4.9, §9.4

**Goal:** Remove the floating "Composing response…" overlay block. `aria-live` block at [ChatUI.tsx:199-202](src/components/chat/ChatUI.tsx#L199-L202) stays.

**Edit:**

Delete lines 210-217 (the `{status === 'streaming' && (...)}` block containing `Loader2` + "Composing response…"). Remove the `Loader2` import if no longer used elsewhere in the file (grep before deleting).

No other change. `<ChatTranscript>` already receives `isStreaming` at line 207.

**Verification:**

```bash
npm run typecheck
npm run test    # all 132+ tests still pass; new tests from prior tasks also pass
```

Manual sanity check (optional): `npm run dev` and submit a chat message — between submit and first chunk, the empty assistant bubble shows three pulsing dots. The bottom-floating "Composing response…" pill is gone.

---

## Task 9 — `src/lib/cockpit/eval-reports.ts` + tests

**Spec:** §4.6, §12.2

**TDD order.** Write tests first.

### 9.1 Test file — `src/lib/cockpit/eval-reports.test.ts`

Three tests per §12.2. Use a temp directory so the test doesn't pollute `data/eval-reports/`. Override `process.cwd` via `vi.spyOn` rather than mocking the `node:process` module — destructured imports of Node built-ins are bound at module load and don't always swap when the module is re-mocked. Spying on the live `process` global is the reliable pattern (sprint-QA M1).

```typescript
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLatestEvalReport } from './eval-reports';

const REPORT_FIXTURE = {
  runId: 'run-abc',
  startedAt: '2026-05-01T12-00-00-000Z',
  completedAt: '2026-05-01T12-00-05-000Z',
  caseResults: [
    { caseId: 'c1', query: 'q1', retrievedChunkIds: [], scorecard: { dimensions: [], totalScore: 4, maxScore: 5, passed: true }, passed: true },
    { caseId: 'c2', query: 'q2', retrievedChunkIds: [], scorecard: { dimensions: [], totalScore: 3, maxScore: 5, passed: false }, passed: false },
  ],
  overallScorecard: { dimensions: [], totalScore: 7, maxScore: 10, passed: false },
  passed: false,
  summary: 'Golden eval: 1/2 passed (7.0/10.0 points)',
};

describe('getLatestEvalReport', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'cockpit-evals-'));
    vi.spyOn(process, 'cwd').mockReturnValue(tmpRoot);
  });
  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns null when data/eval-reports/ does not exist', () => {
    expect(getLatestEvalReport()).toBeNull();
  });

  it('returns null when directory exists but has no golden-*.json files', () => {
    mkdirSync(join(tmpRoot, 'data', 'eval-reports'), { recursive: true });
    writeFileSync(join(tmpRoot, 'data', 'eval-reports', 'README.md'), '');
    expect(getLatestEvalReport()).toBeNull();
  });

  it('returns lexicographically-greatest file projected to EvalHealthSnapshot', () => {
    const dir = join(tmpRoot, 'data', 'eval-reports');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'golden-2025-12-01T12-00-00-000Z.json'),
      JSON.stringify({ ...REPORT_FIXTURE, completedAt: '2025-12-01T12-00-05-000Z' }),
    );
    writeFileSync(
      join(dir, 'golden-2026-05-01T12-00-00-000Z.json'),
      JSON.stringify(REPORT_FIXTURE),
    );
    const snapshot = getLatestEvalReport();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.passedCount).toBe(1);    // derived: caseResults.filter(...)
    expect(snapshot!.totalCases).toBe(2);
    expect(snapshot!.totalScore).toBe(7);
    expect(snapshot!.maxScore).toBe(10);
    expect(snapshot!.lastRunAt).toBe('2026-05-01T12-00-05-000Z'); // completedAt
  });
});
```

### 9.2 Module — `src/lib/cockpit/eval-reports.ts`

Uses `process.cwd()` directly (the global, not a destructured import) so the test's `vi.spyOn(process, 'cwd')` propagates reliably (sprint-QA M1):

```typescript
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EvalRunReport } from '@/lib/evals/domain';
import type { EvalHealthSnapshot } from './types';

const REPORT_FILE_RE = /^golden-.*\.json$/;

export function getLatestEvalReport(): EvalHealthSnapshot | null {
  const dir = join(process.cwd(), 'data', 'eval-reports');
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const reports = files.filter((f) => REPORT_FILE_RE.test(f)).sort().reverse();
  if (reports.length === 0) return null;

  const latest = reports[0];
  const reportPath = join(dir, latest);
  const report = JSON.parse(readFileSync(reportPath, 'utf-8')) as EvalRunReport;

  return {
    passedCount: report.caseResults.filter((r) => r.passed).length,
    totalCases: report.caseResults.length,
    totalScore: report.overallScorecard.totalScore,
    maxScore: report.overallScorecard.maxScore,
    lastRunAt: report.completedAt,
    reportPath,
  };
}
```

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/cockpit/eval-reports.test.ts    # 3 passing
```

---

## Task 10 — `src/lib/cockpit/queries.ts` + tests

**Spec:** §4.3 (LEFT JOIN, `date('now')`), §5, §12.4

**TDD order.** Write tests first.

### 10.1 Test file — `src/lib/cockpit/queries.test.ts`

Five tests per §12.4. Uses the shared `createTestDb` helper from [src/lib/test/db.ts](src/lib/test/db.ts) and `seedUser` from [src/lib/test/seed.ts](src/lib/test/seed.ts).

Key fixtures and assertions (see spec §12.4):

1. `listRecentAuditRows({})`:
   - Seed: 1 user (Editor); insert two `audit_log` rows — one with `actor_user_id` matching the seeded user (`actor_display_name` should resolve), one with `actor_user_id = 'mcp-server'` (`actor_display_name` should be null — verifies LEFT JOIN return shape and the M3 fallback contract).
   - Assert: rows ordered DESC by `created_at`; `actor_display_name` is `null` for the mcp-server row, set to the user's `display_name` for the matching row.

2. `listRecentAuditRows({ actorUserId: 'editor-id' })`:
   - Same seed; assert filter returns 1 row (the editor's), not the mcp-server row.

3. `listScheduledItems({})`:
   - Seed: insert two `content_calendar` rows with different `scheduled_for`. Assert ordered ASC.

4. `listRecentApprovals({})`:
   - Seed: insert two `approvals` rows with different `created_at`. Assert ordered DESC.

5. `getTodaySpend(db)` round-trip:
   - With no row: returns `{ tokens_in: 0, tokens_out: 0, estimated_dollars: 0 }`.
   - After `recordSpend(1000, 500)`: `getTodaySpend()` returns matching values; `estimated_dollars` matches `estimateCost(1000, 500)` from the existing function.

### 10.2 Module — `src/lib/cockpit/queries.ts`

```typescript
import type Database from 'better-sqlite3';
import { estimateCost } from '@/lib/db/spend';
import type {
  ApprovalRecord,
  CockpitAuditRow,
  ScheduledItem,
  SpendSnapshot,
} from './types';

interface ListAuditOpts {
  actorUserId?: string;
  limit: number;
}

export function listRecentAuditRows(
  db: Database.Database,
  opts: ListAuditOpts,
): CockpitAuditRow[] {
  const whereClauses: string[] = [];
  const params: Record<string, unknown> = { limit: opts.limit };
  if (opts.actorUserId !== undefined) {
    whereClauses.push('a.actor_user_id = @actor_user_id');
    params.actor_user_id = opts.actorUserId;
  }
  const whereSql = whereClauses.length
    ? `WHERE ${whereClauses.join(' AND ')}`
    : '';
  return db
    .prepare(
      `SELECT a.*, u.display_name AS actor_display_name
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ${whereSql}
         ORDER BY a.created_at DESC
         LIMIT @limit`,
    )
    .all(params) as CockpitAuditRow[];
}

interface ListScheduledOpts {
  scheduledBy?: string;
  limit: number;
}

export function listScheduledItems(
  db: Database.Database,
  opts: ListScheduledOpts,
): ScheduledItem[] {
  const whereClauses: string[] = [];
  const params: Record<string, unknown> = { limit: opts.limit };
  if (opts.scheduledBy !== undefined) {
    whereClauses.push('scheduled_by = @scheduled_by');
    params.scheduled_by = opts.scheduledBy;
  }
  const whereSql = whereClauses.length
    ? `WHERE ${whereClauses.join(' AND ')}`
    : '';
  return db
    .prepare(
      `SELECT * FROM content_calendar ${whereSql}
       ORDER BY scheduled_for ASC LIMIT @limit`,
    )
    .all(params) as ScheduledItem[];
}

interface ListApprovalsOpts {
  approvedBy?: string;
  limit: number;
}

export function listRecentApprovals(
  db: Database.Database,
  opts: ListApprovalsOpts,
): ApprovalRecord[] {
  const whereClauses: string[] = [];
  const params: Record<string, unknown> = { limit: opts.limit };
  if (opts.approvedBy !== undefined) {
    whereClauses.push('approved_by = @approved_by');
    params.approved_by = opts.approvedBy;
  }
  const whereSql = whereClauses.length
    ? `WHERE ${whereClauses.join(' AND ')}`
    : '';
  return db
    .prepare(
      `SELECT * FROM approvals ${whereSql}
       ORDER BY created_at DESC LIMIT @limit`,
    )
    .all(params) as ApprovalRecord[];
}

/**
 * Reads today's row from spend_log. The WHERE date = date('now') clause is
 * non-negotiable: the writer at src/lib/db/spend.ts:32 uses the same SQLite
 * function (UTC), so reader and writer agree on what "today" means
 * regardless of host timezone (Spec §4.3).
 */
export function getTodaySpend(db: Database.Database): SpendSnapshot {
  const row = db
    .prepare(
      "SELECT date, tokens_in, tokens_out FROM spend_log WHERE date = date('now')",
    )
    .get() as { date: string; tokens_in: number; tokens_out: number } | undefined;

  const today = (db.prepare("SELECT date('now') AS d").get() as { d: string }).d;

  if (!row) {
    return { date: today, tokens_in: 0, tokens_out: 0, estimated_dollars: 0 };
  }

  return {
    date: row.date,
    tokens_in: row.tokens_in,
    tokens_out: row.tokens_out,
    estimated_dollars: estimateCost(row.tokens_in, row.tokens_out),
  };
}
```

**Verification:**

```bash
npm run typecheck
npm run test -- src/lib/cockpit/queries.test.ts    # 5 passing
```

---

## Task 11 — Server actions + tests *(moved up — sprint-QA H1)*

**Spec:** §8 (primary security boundary), §10, §12.5

**Why this lands here, not at the end.** Tasks 13-17 (the panels) each `import { refreshXxx } from '@/app/cockpit/actions';`. If actions.ts doesn't exist when a panel task's `npm run typecheck` runs, the panel task fails. Sprint-QA finding H1 reorders actions in front of the panels. Dependencies on this task: queries.ts (Task 10) and eval-reports.ts (Task 9) — both done.

### 11.1 Module — `src/app/cockpit/actions.ts`

`requireOperator` and `requireAdmin` are invoked for their throw side-effect; their return values are intentionally discarded (sprint-QA L1 — the original `void` patterns were removed).

```typescript
'use server';

import { cookies } from 'next/headers';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import {
  getTodaySpend,
  listRecentApprovals,
  listRecentAuditRows,
  listScheduledItems,
} from '@/lib/cockpit/queries';
import { getLatestEvalReport } from '@/lib/cockpit/eval-reports';
import type {
  ApprovalRecord,
  CockpitAuditRow,
  EvalHealthSnapshot,
  ScheduledItem,
  SpendSnapshot,
} from '@/lib/cockpit/types';

export const runtime = 'nodejs';

interface SessionResult {
  userId: string;
  role: Role;
}

async function resolveSession(): Promise<SessionResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('contentops_session');
  let userId: string | undefined = DEMO_USERS.find((u) => u.role === 'Creator')?.id;
  let role: Role = 'Creator';
  if (sessionCookie) {
    const payload = await decrypt(sessionCookie.value);
    if (payload?.userId) {
      userId = payload.userId;
      role = payload.role;
    }
  }
  if (!userId) throw new Error('Unauthorized: no demo Creator user seeded');
  return { userId, role };
}

function requireOperator(session: SessionResult): SessionResult {
  if (session.role === 'Creator') {
    throw new Error('Forbidden: cockpit is not available to Creator role');
  }
  return session;
}

function requireAdmin(session: SessionResult): SessionResult {
  if (session.role !== 'Admin') {
    throw new Error('Forbidden: action is Admin-only');
  }
  return session;
}

export async function refreshAuditFeed(opts: {
  since?: number;
  limit?: number;
}): Promise<{ entries: CockpitAuditRow[]; nextSince: number | null }> {
  const session = requireOperator(await resolveSession());
  const limit = opts.limit ?? 50;
  const entries = listRecentAuditRows(db, {
    actorUserId: session.role === 'Admin' ? undefined : session.userId,
    limit,
  });
  const nextSince = entries.length === limit ? entries[entries.length - 1].created_at : null;
  return { entries, nextSince };
}

export async function refreshSchedule(opts: {
  limit?: number;
}): Promise<{ items: ScheduledItem[] }> {
  const session = requireOperator(await resolveSession());
  return {
    items: listScheduledItems(db, {
      scheduledBy: session.role === 'Admin' ? undefined : session.userId,
      limit: opts.limit ?? 50,
    }),
  };
}

export async function refreshApprovals(opts: {
  limit?: number;
}): Promise<{ items: ApprovalRecord[] }> {
  // Admin-only — Spec §4.5. Editor calling this is UI drift or probe;
  // refuse rather than empty-array. requireAdmin throws for non-Admin.
  requireAdmin(await resolveSession());
  return {
    items: listRecentApprovals(db, {
      approvedBy: undefined,
      limit: opts.limit ?? 50,
    }),
  };
}

export async function refreshSpend(): Promise<{ spend: SpendSnapshot }> {
  requireOperator(await resolveSession());
  return { spend: getTodaySpend(db) };
}

export async function refreshEvalHealth(): Promise<{ snapshot: EvalHealthSnapshot | null }> {
  requireOperator(await resolveSession());
  return { snapshot: getLatestEvalReport() };
}
```

### 11.2 Tests — `src/app/cockpit/actions.test.ts`

Four tests per spec §12.5 (the spec was updated to enumerate four — see sprint-QA M2):

1. **Admin session: `refreshAuditFeed` returns all rows.**
2. **Editor session: `refreshAuditFeed` returns only own rows** (filter `actorUserId = userId` applied).
3. **Creator session: every action throws.** Iterate `[refreshAuditFeed, refreshSchedule, refreshApprovals, refreshSpend, refreshEvalHealth]` and `expect(...).rejects.toThrow(/Forbidden/)`.
4. **Editor session: `refreshApprovals` throws.** Distinct from #3 — exercises `requireAdmin` (Admin-only gate), not `requireOperator` (Editor-allowed gate). The other actions accept Editor.

Tests stub the cookie via `vi.mock('next/headers', () => ({ cookies: vi.fn() }))` and call the actions directly (they are plain async functions in test).

**Verification:**

```bash
npm run typecheck
npm run test -- src/app/cockpit/actions.test.ts    # 4 passing
```

---

## Task 12 — `src/components/cockpit/RefreshButton.tsx`

**Spec:** §6.7

**Goal:** Tiny shared micro-component used by every panel header. No tests of its own (it's covered by panel tests in Tasks 13-17).

```tsx
'use client';

import { RefreshCw } from 'lucide-react';

export interface RefreshButtonProps {
  isRefreshing: boolean;
  onClick: () => void;
}

export function RefreshButton({ isRefreshing, onClick }: RefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isRefreshing}
      aria-label="Refresh panel"
      className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700 disabled:opacity-40"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
    </button>
  );
}
```

**Verification:**

```bash
npm run typecheck    # 0 errors
```

---

## Task 13 — `<AuditFeedPanel>` + tests

**Spec:** §6.2, §12.7 (AuditFeedPanel #1, #2)

**Goal:** Renders rows from `CockpitAuditRow[]`. Each `executed` row shows an Undo button (visibility gated by RBAC — see below). Falls back to literal `actor_user_id` when `actor_display_name` is null.

### 13.1 Component — `src/components/cockpit/AuditFeedPanel.tsx`

Skeleton (full Tailwind styling at implementation time):

```tsx
'use client';

import { useState } from 'react';
import { useRollback } from '@/lib/audit/use-rollback';
import type { Role } from '@/lib/auth/types';
import type { CockpitAuditRow } from '@/lib/cockpit/types';
import { refreshAuditFeed } from '@/app/cockpit/actions';
import { RefreshButton } from './RefreshButton';

export interface AuditFeedPanelProps {
  initialRows: CockpitAuditRow[];
  role: Role;
  userId: string;
}

function AuditRow({ row, role, userId }: { row: CockpitAuditRow; role: Role; userId: string }) {
  const { status, rollback } = useRollback(row.id);
  const canUndo =
    row.status === 'executed' &&
    (role === 'Admin' || row.actor_user_id === userId);
  const actor = row.actor_display_name ?? row.actor_user_id;
  // ... render columns: timestamp, tool, actor, input summary, status badge, Undo button when canUndo && status === 'idle' ...
}

export function AuditFeedPanel({ initialRows, role, userId }: AuditFeedPanelProps) {
  const [rows, setRows] = useState(initialRows);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function refresh() {
    setIsRefreshing(true);
    const { entries } = await refreshAuditFeed({ limit: 50 });
    setRows(entries);
    setIsRefreshing(false);
  }

  // ... render header with title + RefreshButton + Load more ...
}
```

Empty state: "No tool actions recorded yet." Status badges: green for `executed`, gray with relative time for `rolled_back`.

### 13.2 Tests — `src/components/cockpit/AuditFeedPanel.test.tsx`

Two tests per spec §12.7 AuditFeedPanel:

1. **Empty state.** `<AuditFeedPanel initialRows={[]} role="Admin" userId="u1" />` renders "No tool actions recorded yet."
2. **Undo + mcp-server fallback.** `<AuditFeedPanel initialRows={[<editor-owned executed row>, <mcp-server row>]} role="Editor" userId="editor-id" />`:
   - Undo button visible on the editor-owned row.
   - No Undo button on the `mcp-server` row (Editor doesn't own it).
   - Actor cell on the mcp-server row reads `mcp-server` (literal fallback because `actor_display_name` is null).

The tests mock the `refreshAuditFeed` server action via `vi.mock('@/app/cockpit/actions', () => ({ refreshAuditFeed: vi.fn() }))`.

**Verification:**

```bash
npm run typecheck
npm run test -- src/components/cockpit/AuditFeedPanel.test.tsx    # 2 passing
```

---

## Task 14 — `<SchedulePanel>` + tests

**Spec:** §6.3, §12.7 SchedulePanel

### 14.1 Component — `src/components/cockpit/SchedulePanel.tsx`

```tsx
'use client';

import { useState } from 'react';
import type { ScheduledItem } from '@/lib/cockpit/types';
import { refreshSchedule } from '@/app/cockpit/actions';
import { RefreshButton } from './RefreshButton';

export interface SchedulePanelProps {
  initialItems: ScheduledItem[];
}

export function SchedulePanel({ initialItems }: SchedulePanelProps) {
  // ... list rendering, empty state "Nothing scheduled.", refresh handler ...
}
```

Columns per §6.3: scheduled_for (formatted local date+time), channel, document_slug, scheduled_by.

### 14.2 Tests — `src/components/cockpit/SchedulePanel.test.tsx`

Two tests:
1. Empty state shows "Nothing scheduled."
2. Populated state renders one row per item with the four columns.

**Verification:**

```bash
npm run typecheck
npm run test -- src/components/cockpit/SchedulePanel.test.tsx    # 2 passing
```

---

## Task 15 — `<ApprovalsPanel>` + tests

**Spec:** §4.5 (Admin-only), §6.4, §12.7 ApprovalsPanel

### 15.1 Component — `src/components/cockpit/ApprovalsPanel.tsx`

The panel itself does NOT enforce its Admin-only nature — that's `<CockpitDashboard>`'s job (Task 18). The component renders for whatever input it gets. But its exported `ApprovalsPanelProps` does not include `role` — the gate is at the dashboard level.

```tsx
'use client';

import { useState } from 'react';
import type { ApprovalRecord } from '@/lib/cockpit/types';
import { refreshApprovals } from '@/app/cockpit/actions';
import { RefreshButton } from './RefreshButton';

export interface ApprovalsPanelProps {
  initialItems: ApprovalRecord[];
}

export function ApprovalsPanel({ initialItems }: ApprovalsPanelProps) {
  // ... list rendering, empty state "No approvals recorded yet.", refresh handler ...
}
```

### 15.2 Tests — `src/components/cockpit/ApprovalsPanel.test.tsx`

Two tests:
1. Empty state shows "No approvals recorded yet."
2. Populated state renders rows.

The "panel not rendered for Editor" assertion belongs in the cockpit page test (Task 19), not here.

**Verification:**

```bash
npm run typecheck
npm run test -- src/components/cockpit/ApprovalsPanel.test.tsx    # 2 passing
```

---

## Task 16 — `<EvalHealthPanel>` + tests

**Spec:** §6.5, §12.7 EvalHealthPanel

### 16.1 Component — `src/components/cockpit/EvalHealthPanel.tsx`

Three render branches per §6.5:
- `null` snapshot → "No eval runs recorded yet — run `npm run eval:golden`."
- All passed (`passedCount === totalCases`) → green pill style.
- Some failed → amber pill style.

Headline: `<passedCount> / <totalCases> passed`. Secondary: `<totalScore>/<maxScore> points • <relative time>`.

### 16.2 Tests

Three tests per spec §12.7 EvalHealthPanel:
1. Null snapshot → empty message rendered.
2. Populated snapshot, all passed → green badge + headline.
3. Populated snapshot, some failed → amber badge + headline.

**Verification:**

```bash
npm run typecheck
npm run test -- src/components/cockpit/EvalHealthPanel.test.tsx    # 3 passing
```

---

## Task 17 — `<SpendPanel>` + tests

**Spec:** §6.6, §12.7 SpendPanel

### 17.1 Component — `src/components/cockpit/SpendPanel.tsx`

Three stats: `tokens_in`, `tokens_out`, `≈ $<estimated_dollars.toFixed(4)>`. The dollar amount is taken **directly** from `spend.estimated_dollars` — the panel does NOT call `estimateCost` itself. The query layer (Task 10) computed it; the panel is a pure renderer.

### 17.2 Tests

Two tests:
1. Zero state: snapshot with all zeros renders "0", "0", "≈ $0.0000".
2. Populated state: renders the three numbers from the snapshot.

**Verification:**

```bash
npm run typecheck
npm run test -- src/components/cockpit/SpendPanel.test.tsx    # 2 passing
```

---

## Task 18 — `<CockpitDashboard>`

**Spec:** §4.5, §6.1

**Goal:** Top-level client component. Conditionally renders `<ApprovalsPanel>` only when `role === 'Admin'`. Layout is a 2-column grid on `lg:` (left: AuditFeed; right stack: Spend + EvalHealth + Schedule + ApprovalsPanel-if-Admin).

```tsx
'use client';

import type { CockpitInitialData } from '@/lib/cockpit/types';
import { AuditFeedPanel } from './AuditFeedPanel';
import { SchedulePanel } from './SchedulePanel';
import { ApprovalsPanel } from './ApprovalsPanel';
import { EvalHealthPanel } from './EvalHealthPanel';
import { SpendPanel } from './SpendPanel';

export interface CockpitDashboardProps {
  initialData: CockpitInitialData;
}

export function CockpitDashboard({ initialData }: CockpitDashboardProps) {
  const { recentAudit, scheduled, approvals, evalHealth, spend, role, userId } = initialData;
  const isAdmin = role === 'Admin';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-1">
        <AuditFeedPanel initialRows={recentAudit} role={role} userId={userId} />
      </div>
      <div className="flex flex-col gap-4">
        <SpendPanel initialSnapshot={spend} />
        <EvalHealthPanel initialSnapshot={evalHealth} />
        <SchedulePanel initialItems={scheduled} />
        {isAdmin && <ApprovalsPanel initialItems={approvals} />}
      </div>
    </div>
  );
}
```

The Admin-only branch for ApprovalsPanel is the structural enforcement of spec §4.5. The cockpit page test (Task 19) and the actions test (Task 11) cover the branch behavior.

No standalone test file for the dashboard — it is exercised by the cockpit page integration test in Task 19.

**Verification:**

```bash
npm run typecheck    # 0 errors
```

---

## Task 19 — Cockpit page + layout + page tests

**Spec:** §4.1, §4.2, §12.6

### 19.1 Layout — `src/app/cockpit/layout.tsx`

```tsx
import type { ReactNode } from 'react';

export default function CockpitLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f8f9fa] font-sans text-gray-900">
      {children}
    </main>
  );
}
```

Light shell only. The chat-style header (with "← Chat" link) lives inside `page.tsx` because it depends on session-resolved data.

### 19.2 Page — `src/app/cockpit/page.tsx`

```tsx
import { Layers } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RoleSwitcher } from '@/components/auth/RoleSwitcher';
import { CockpitDashboard } from '@/components/cockpit/CockpitDashboard';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import type { Role } from '@/lib/auth/types';
import { db } from '@/lib/db';
import { getLatestEvalReport } from '@/lib/cockpit/eval-reports';
import {
  getTodaySpend,
  listRecentApprovals,
  listRecentAuditRows,
  listScheduledItems,
} from '@/lib/cockpit/queries';
import type { CockpitInitialData } from '@/lib/cockpit/types';

export const runtime = 'nodejs';

export default async function CockpitPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('contentops_session');
  const payload = sessionCookie ? await decrypt(sessionCookie.value) : null;
  const role: Role = payload?.role ?? 'Creator';
  const userId = payload?.userId ?? DEMO_USERS.find((u) => u.role === 'Creator')?.id;

  if (role === 'Creator' || !userId) {
    redirect('/');
  }

  const isAdmin = role === 'Admin';
  const actorFilter = isAdmin ? undefined : userId;

  const initialData: CockpitInitialData = {
    recentAudit: listRecentAuditRows(db, { actorUserId: actorFilter, limit: 50 }),
    scheduled: listScheduledItems(db, { scheduledBy: actorFilter, limit: 50 }),
    approvals: isAdmin
      ? listRecentApprovals(db, { approvedBy: undefined, limit: 50 })
      : [],
    evalHealth: getLatestEvalReport(),
    spend: getTodaySpend(db),
    role,
    userId,
  };

  return (
    <>
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8 py-3.5">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
            ← Chat
          </Link>
          <span className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-gray-800">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.5} />
            </span>
            Operator Cockpit
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">
        <CockpitDashboard initialData={initialData} />
      </div>
      <RoleSwitcher currentRole={role} />
    </>
  );
}
```

### 19.3 Page tests — `src/app/cockpit/page.test.tsx`

Four tests per §12.6. Server-component testing requires mocking `next/headers`, `next/navigation`, and the DB. Pattern follows the existing chat route integration test.

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';
import { encrypt } from '@/lib/auth/session';
import { DEMO_USERS } from '@/lib/auth/constants';

vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }) }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));

import { cookies } from 'next/headers';

describe('CockpitPage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('redirects to / when there is no cookie', async () => {
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({ get: () => undefined });
    const CockpitPage = (await import('./page')).default;
    await expect(CockpitPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('redirects to / when the session decrypts to Creator role', async () => {
    const creator = DEMO_USERS.find((u) => u.role === 'Creator')!;
    const token = await encrypt({ userId: creator.id, role: 'Creator', displayName: creator.display_name });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: () => ({ value: token }),
    });
    const CockpitPage = (await import('./page')).default;
    await expect(CockpitPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/');
  });

  it('renders the dashboard for Editor session; Approvals panel is absent in initial data', async () => {
    const editor = DEMO_USERS.find((u) => u.role === 'Editor')!;
    const token = await encrypt({ userId: editor.id, role: 'Editor', displayName: editor.display_name });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: () => ({ value: token }),
    });
    const CockpitPage = (await import('./page')).default;
    // Render output assertion is structural — assert initialData.approvals === []
    // by mocking CockpitDashboard with vi.mock and reading its props.
    // (Concrete pattern: see src/app/page.test.tsx mock pattern.)
  });

  it('renders the dashboard for Admin session; Approvals panel is populated', async () => {
    // Symmetric to the Editor test — mock CockpitDashboard to capture props.
  });
});
```

**Verification:**

```bash
npm run typecheck
npm run test -- src/app/cockpit/    # 4 passing (page tests + actions tests carried)
```

---

## Task 20 — `src/app/page.tsx` header changes

**Spec:** §3 Non-Goals (sprint chip), §4.10, §9.1, §11 Modified

**Goal:**
1. Add a `<Link href="/cockpit">Cockpit</Link>` next to the existing logo, visible only when `currentRole !== 'Creator'`.
2. Remove the `<span>...sprint-3</span>` chip at lines 77-79.

**Edit:**

Around the `<header>` in `page.tsx`:

```tsx
<header className="z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8 py-3.5">
  <div className="flex items-center gap-4">
    <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-gray-800 transition-opacity hover:opacity-75">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white">
        <Layers className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={2.5} />
      </span>
      ContentOps Studio
    </Link>
    {currentRole !== 'Creator' && (
      <Link
        href="/cockpit"
        className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
      >
        Cockpit
      </Link>
    )}
  </div>
  {/* sprint chip removed in Sprint 9 — see spec §3 / §9.1 */}
</header>
```

If a `page.test.tsx` exists for the chat page, ensure it still passes. The chip removal may need a test update if any test asserts its presence (grep first).

**Verification:**

```bash
npm run typecheck
npm run test -- src/app/page.test.tsx    # passes; update if it asserted the chip
npm run test                                 # nothing else regressed
```

---

## Task 21 — Extend `tests/e2e/chat-tool-use.spec.ts` with typing-indicator assertion

**Spec:** §12.10

**Goal:** Add an assertion in the existing E2E flow: after submit, before the first stream chunk, the `[role="status"][aria-label="Assistant is composing"]` indicator is visible.

**Edit:**

After `await page.getByRole('button', { name: 'Send message' }).click();` (line 42), insert:

```typescript
// Sprint 9 §12.10 — typing indicator visible between submit and first chunk.
// The indicator unmounts as soon as a tool_use arrives or text streams in.
const indicator = page.getByRole('status', { name: 'Assistant is composing' });
await expect(indicator).toBeVisible({ timeout: 5000 });
```

The indicator unmounts when the tool_use arrives (per spec §4.9 four-clause condition) — the existing assertion that the ToolCard becomes visible naturally follows.

**Timing note (sprint-QA M3).** The indicator unmounts when the first `tool_use` event arrives. If the E2E mock's first response lands faster than Playwright's first poll cycle (~100ms), this assertion can flake. Mitigations available if it surfaces:

- (a) Add a small artificial delay in `src/lib/anthropic/e2e-mock.ts` (e.g., `await new Promise(r => setTimeout(r, 150))` before the first tool_use chunk) — gates the indicator's visibility window above Playwright's poll interval. **Preferred.**
- (b) Switch the assertion to `await page.waitForFunction(() => document.querySelector('[role="status"][aria-label="Assistant is composing"]') !== null, { timeout: 1000 })` which can fire on a 10ms internal microtask. Acceptable fallback.

Run the spec 10× locally before declaring this task complete; if any run fails on this assertion, apply (a). Do not weaken the assertion to a no-op like `not.toBeVisible({ timeout: 0 })`.

**Verification:**

```bash
npm run test:e2e    # 1 spec still passing with the new assertion
```

---

## Task 22 — `tests/e2e/cockpit-dashboard.spec.ts`

**Spec:** §12.9

**Goal:** Smoke test for the cockpit. Sign an Admin cookie, navigate to `/cockpit`, assert each panel header is visible, click Undo on a seeded executed row, assert it transitions to "Rolled back."

**Cite and copy.** Use the cookie-signing pattern from [tests/e2e/chat-tool-use.spec.ts:5-26](tests/e2e/chat-tool-use.spec.ts#L5-L26) — the Admin demo user's session encrypts the same way.

```typescript
import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { encrypt } from '@/lib/auth/session';

test.beforeEach(async ({ context, page }) => {
  const admin = DEMO_USERS.find((u) => u.role === 'Admin');
  if (!admin) throw new Error('Admin demo user not found');
  const token = await encrypt({
    userId: admin.id,
    role: 'Admin',
    displayName: admin.display_name,
  });
  await context.addCookies([
    {
      name: 'contentops_session',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  // Seed at least one executed audit_log row so Undo is exercised.
  // The simplest path: use the chat tool flow first to create a row,
  // then navigate to /cockpit. The CONTENTOPS_E2E_MOCK=1 dev server
  // returns a deterministic schedule_content_item tool_use.
  await page.goto('/');
  await page
    .getByRole('textbox')
    .fill('Schedule a brand-identity post for twitter tomorrow.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByRole('button').filter({ hasText: 'schedule_content_item' }),
  ).toBeVisible({ timeout: 30_000 });
});

test('cockpit dashboard renders panels and supports Undo on audit row', async ({ page }) => {
  await page.goto('/cockpit');

  // Each panel header visible.
  await expect(page.getByText('Operator Cockpit')).toBeVisible();
  await expect(page.getByText(/Recent actions|Audit/i)).toBeVisible();
  await expect(page.getByText(/Spend/i)).toBeVisible();
  await expect(page.getByText(/Eval health|Eval/i)).toBeVisible();
  await expect(page.getByText(/Schedule/i)).toBeVisible();
  await expect(page.getByText(/Approvals/i)).toBeVisible();   // Admin-only; visible here

  // Click Undo on the first executed audit row.
  const undo = page.getByRole('button', { name: 'Undo', exact: true }).first();
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(
    page.getByText('Rolled back', { exact: true }).first(),
  ).toBeVisible({ timeout: 5000 });
});
```

**Verification:**

```bash
npm run test:e2e    # 2 specs passing (chat-tool-use + cockpit-dashboard)
```

---

## Task 23 — Final verification

Run every check declared by the spec. Fix any regression in place; do not add scope.

```bash
npm run typecheck
npm run lint               # pre-existing Sprint 7-era format issues remain (out-of-scope)
npm run test               # ≥ 167 passing (132 baseline + 35 new)
npm run test:e2e           # 2 specs passing
npm run eval:golden        # 5/5 passing
npm run mcp:server         # starts cleanly; Ctrl+C to exit
```

**Manual sanity check** (charter §7 step 6):

- `npm run dev`, sign in as Admin via the Role overlay, navigate to `/cockpit` — all panels render with seeded data; Undo on an audit row transitions to "Rolled back".
- Sign in as Editor — Approvals panel is absent; Schedule and AuditFeed show only own rows.
- Sign in as Creator (or remove cookie) — clicking the Cockpit link in the header is impossible (the link itself is hidden); typing `/cockpit` into the URL bar redirects to `/`.
- Submit a chat message — the in-bubble three-dot indicator appears between submit and first chunk, then unmounts when content (or a ToolCard) arrives. The bottom-floating "Composing response…" pill is gone.

---

## Commit strategy

Single sprint commit (charter §7 step 7 pattern):

```
feat(s9): operator cockpit dashboard + typing indicator

- /cockpit route (server-rendered, RBAC-gated): audit feed with Undo,
  schedule, approvals (Admin-only history), eval health, today's spend.
- Server actions for per-panel manual refresh; explicit nodejs runtime;
  primary RBAC boundary inside each action. No new HTTP routes.
- Typing indicator in empty assistant bubble between submit and first chunk;
  hidden when a tool invocation is underway. Removes the floating
  "Composing response…" overlay (now redundant).
- Extract useRollback hook to src/lib/audit/; ToolCard + AuditFeedPanel
  both consume it. Remove ToolCard's local ToolInvocation duplicate.
- Spend panel reuses existing estimateCost from src/lib/db/spend.ts
  (no new pricing module — single source of truth with the daily-spend
  ceiling check). Add citation comment above the constants.
- Audit-feed query LEFT JOINs users for actor display name; falls back
  to actor_user_id literal for mcp-server-attributed rows.
- Drop the stale sprint-3 header chip rather than re-hardcoding sprint-9.
- 167+ Vitest tests passing (132 baseline + 35 new) + 2 Playwright specs
  (cockpit smoke + chat-tool-use extended with typing-indicator assertion).
- eval:golden: 5/5 passing (no regression).
```

---

## Stop-the-line checklist

I will surface and stop if any of the following surface during implementation:

- A library API used by Sprint 9 differs from spec §16's Context7-verified shape (e.g., Next.js 16 `'use server'` semantics changed in a patch release between drafting and impl).
- Task 4's characterization diff shows assertion-text differences between before/after `ToolCard.test.tsx` runs — Sprint 8 regression risk; investigate before continuing.
- The cockpit page test (Task 19) cannot be made to mock the server-component `cookies()` import cleanly — would force a refactor of the auth helper into a passable function. If it surfaces, surface to the operator before refactoring.
- Any cockpit query helper would have to bypass the audit-log RBAC predicate to satisfy a new requirement — this would split the RBAC source of truth (spec §17 first risk row).
- The Playwright cockpit test depends on global state from the chat test running first (test order coupling) — if observed, prefer to seed via DB directly inside `beforeEach` rather than via the chat flow.
- **Task 21's typing-indicator assertion flakes more than once in 10 local runs.** Apply mitigation (a) from the task body (artificial delay in `e2e-mock.ts`) before continuing. Do not weaken the assertion to a no-op or remove it.

If a stop-the-line surfaces, update the spec (or surface a charter §9 condition) before continuing — do not silently resolve.
