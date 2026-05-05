import { Layers } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { RoleSwitcher } from '@/components/auth/RoleSwitcher';
import type { ChatMessageProps } from '@/components/chat/ChatMessage';
import { ChatUI } from '@/components/chat/ChatUI';
import { WorkspaceHeader } from '@/components/cockpit/WorkspaceHeader';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import { getLatestConversationForWorkspace } from '@/lib/chat/conversations';
import { db } from '@/lib/db';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  decodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import {
  getActiveWorkspace,
  listVisitorBrands,
} from '@/lib/workspaces/queries';

export const runtime = 'nodejs';

export default async function Home() {
  const cookieStore = await cookies();

  // Sprint 11 (revised) — middleware always issues a sample-workspace
  // cookie when none exists, so the cookie should be present on every
  // request. The remaining null cases are: (a) an extremely brief race
  // where the cookie fails decode (treated as fresh visit — fall through
  // to sample), and (b) a previously-valid custom workspace that's been
  // TTL-purged while its cookie remains valid (rare; fall back to sample
  // and clear cookie so middleware re-issues on the next request).
  const workspaceCookie = cookieStore.get(WORKSPACE_COOKIE_NAME);
  const workspacePayload = workspaceCookie
    ? await decodeWorkspace(workspaceCookie.value)
    : null;
  let workspace = workspacePayload
    ? getActiveWorkspace(db, workspacePayload.workspace_id)
    : null;
  if (!workspace) {
    if (workspaceCookie) cookieStore.delete(WORKSPACE_COOKIE_NAME);
    workspace = {
      id: SAMPLE_WORKSPACE.id,
      name: SAMPLE_WORKSPACE.name,
      description: SAMPLE_WORKSPACE.description,
      is_sample: 1,
      created_at: 0,
      expires_at: null,
    };
  }

  const otherBrands = workspacePayload
    ? listVisitorBrands(
        db,
        workspacePayload.created_workspace_ids,
        workspace.id,
      )
    : [];

  const sessionCookie = cookieStore.get('contentops_session');

  let currentRole: 'Creator' | 'Editor' | 'Admin' = 'Creator';
  let currentUserId = DEMO_USERS.find((u) => u.role === 'Creator')?.id;

  if (sessionCookie) {
    const payload = await decrypt(sessionCookie.value);
    if (payload?.userId) {
      // Verify user still exists in DB after refresh
      const userExists = db
        .prepare('SELECT 1 FROM users WHERE id = ?')
        .get(payload.userId);

      if (userExists) {
        currentRole = payload.role;
        currentUserId = payload.userId;
      }
    }
  }

  // Fetch conversation and messages
  let conversationId: string | null = null;
  let initialMessages: ChatMessageProps[] = [];

  if (currentUserId) {
    // Round 3 — filter by workspace_id so previous-workspace history doesn't
    // bleed across after the user uploads a new brand. Spec §20.
    const conv = getLatestConversationForWorkspace(db, {
      userId: currentUserId,
      workspaceId: workspace.id,
    });

    if (conv) {
      conversationId = conv.id;
      const msgs = db
        .prepare(
          'SELECT id, role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
        )
        .all(conversationId) as { id: string; role: string; content: string }[];
      initialMessages = msgs.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
    }
  }

  return (
    <main className="grid h-screen max-h-screen grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[#f8f9fa] font-sans text-gray-900">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8 py-3.5">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-tight text-gray-800 transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white">
              <Layers
                className="h-3.5 w-3.5"
                aria-hidden="true"
                strokeWidth={2.5}
              />
            </span>
            ContentOps Studio
          </Link>
          <WorkspaceHeader workspace={workspace} otherBrands={otherBrands} />
          {currentRole !== 'Creator' && (
            <Link
              href="/cockpit"
              className="rounded-md px-1 text-sm font-medium text-gray-500 transition-colors hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
            >
              Cockpit
            </Link>
          )}
        </div>
        {/* Sprint chip removed in Sprint 9 — see spec §3 / §9.1 */}
      </header>
      <div className="flex min-h-0 w-full justify-center overflow-hidden">
        <div className="relative flex h-full w-full max-w-[52rem] flex-col border-x border-gray-100 bg-white">
          <ChatUI
            key={workspace.id}
            initialMessages={initialMessages}
            conversationId={conversationId}
            workspaceName={workspace.name}
          />
        </div>
      </div>
      {/* Always show in development for persona testing */}
      <RoleSwitcher currentRole={currentRole} />
    </main>
  );
}
