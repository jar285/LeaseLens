/*
 * Sprint 18 §5 — shared test-render helpers for chat components.
 *
 * `withChatStream(ui, { viewerRole, activeLease })` wraps a rendered
 * tree in <ChatStreamProvider> so consumers of useChatStream don't
 * crash in tests. Centralising the wrapper here keeps the test files
 * terse and ensures we don't drift on default values.
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
import type { Role } from '@/lib/auth/types';

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
    <ChatStreamProvider
      viewerRole={viewerRole}
      initialEvents={initialEvents}
      activeLease={activeLease}
    >
      {ui}
    </ChatStreamProvider>
  );
}
