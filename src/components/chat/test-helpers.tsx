/*
 * Sprint 18 §5 — shared test-render helpers for chat components.
 *
 * `withChatStream(ui, { viewerRole })` wraps a rendered tree in
 * <ChatStreamProvider> with the given viewer role. Most existing
 * ChatMessage tests used to render the component naked; once
 * ChatMessage started reading `viewerRole` from context, every one of
 * those tests needed a provider. Centralising the wrapper here keeps
 * the test files terse and ensures we don't drift on default values.
 *
 * Default `viewerRole` is `Creator` (the tenant view) so legacy tests
 * exercise the most-restrictive surface by default. Tests that need a
 * Reviewer/Admin path pass it explicitly.
 */

import type { ReactElement } from 'react';
import {
  ChatStreamProvider,
  type ToolEvent,
} from '@/components/chat/ChatStreamContext';
import type { Role } from '@/lib/auth/types';

export interface ChatStreamHarnessOptions {
  viewerRole?: Role;
  initialEvents?: ToolEvent[];
}

export function withChatStream(
  ui: ReactElement,
  { viewerRole = 'Creator', initialEvents = [] }: ChatStreamHarnessOptions = {},
): ReactElement {
  return (
    <ChatStreamProvider viewerRole={viewerRole} initialEvents={initialEvents}>
      {ui}
    </ChatStreamProvider>
  );
}
