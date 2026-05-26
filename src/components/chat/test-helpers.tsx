/*
 * Sprint 18 §5 — shared test-render helpers for chat components.
 *
 * `withChatStream(ui, { viewerRole, activeLease })` wraps a rendered
 * tree in BOTH <LeaseParserProvider> and <ChatStreamProvider> so
 * consumers reading parser state (lease, tool events, active clause)
 * via either context see the same seed data. Centralising the wrapper
 * here keeps the test files terse and ensures we don't drift on
 * default values.
 *
 * Sprint 28.6 — both providers are seeded with the same
 * `initialEvents` and `activeLease` so the consumer migration from
 * `useChatStream` to `useLeaseParser` happens behind a stable test
 * surface. After Sprint 4 strips parser state from ChatStreamProvider,
 * only LeaseParserProvider will hold the seed.
 *
 * Default `viewerRole` is `Tenant` (the most-restrictive view) so
 * legacy tests exercise the same surface real users see by default.
 * Tests that need a Reviewer/Admin path pass it explicitly. Default
 * `activeLease` is null so legacy tests don't accidentally trigger
 * the S19.3 synthetic intro message.
 */

import type { ReactElement } from 'react';
import {
  type ActiveLeaseRef,
  ChatStreamProvider,
  type ToolEvent,
} from '@/components/chat/ChatStreamContext';
import { LeaseParserProvider } from '@/components/lease/LeaseParserContext';
import type { Role } from '@/lib/auth/types';
import { AssistantFabProvider } from './AssistantFabContext';

export interface ChatStreamHarnessOptions {
  viewerRole?: Role;
  initialEvents?: ToolEvent[];
  activeLease?: ActiveLeaseRef | null;
}

export function withChatStream(
  ui: ReactElement,
  {
    viewerRole = 'Tenant',
    initialEvents = [],
    activeLease = null,
  }: ChatStreamHarnessOptions = {},
): ReactElement {
  return (
    <AssistantFabProvider>
      <LeaseParserProvider
        initialEvents={initialEvents}
        activeLease={activeLease}
      >
        <ChatStreamProvider viewerRole={viewerRole}>{ui}</ChatStreamProvider>
      </LeaseParserProvider>
    </AssistantFabProvider>
  );
}
