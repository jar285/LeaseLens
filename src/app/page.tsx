import { ScrollText } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { RoleSwitcher } from '@/components/auth/RoleSwitcher';
import type { ChatMessageProps } from '@/components/chat/ChatMessage';
import { WorkspaceHeader } from '@/components/cockpit/WorkspaceHeader';
import { LeaseLensWorkspaceShell } from '@/components/lease/LeaseLensWorkspaceShell';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import { getLatestConversationForWorkspace } from '@/lib/chat/conversations';
import { rehydrateConversationMessages } from '@/lib/chat/rehydrate-history';
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

  const sessionCookie = cookieStore.get('leaselens_session');

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
      initialMessages = rehydrateConversationMessages(msgs);
    }
  }

  return (
    // Phase 10.5 — outermost shell uses h-dvh + flex-col so the header
    // takes its natural height and the rest of the viewport is exactly
    // one min-h-0 region. Every child below this point owns its own
    // overflow chain; the page itself never scrolls.
    <main className="flex h-dvh flex-col overflow-hidden bg-[#f8f9fa] font-sans text-gray-900">
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8 py-3.5">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-md text-[15px] font-semibold tracking-tight text-gray-800 transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200 focus-visible:ring-offset-2"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-white">
              <ScrollText
                className="h-3.5 w-3.5"
                aria-hidden="true"
                strokeWidth={2.5}
              />
            </span>
            LeaseLens
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
        {/* Phase 10.8 — role switcher relocated from a floating
            bottom-right group (which overlapped the last red-flag
            card) into the global header. Always rendered in dev for
            persona testing. */}
        <RoleSwitcher currentRole={currentRole} />
      </header>
      <LeaseLensWorkspaceShell
        key={workspace.id}
        initialMessages={initialMessages}
        conversationId={conversationId}
        workspaceName={workspace.name}
      />
    </main>
  );
}
