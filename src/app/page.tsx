import { Layers } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { RoleSwitcher } from '@/components/auth/RoleSwitcher';
import type { ChatMessageProps } from '@/components/chat/ChatMessage';
import { ChatUI } from '@/components/chat/ChatUI';
import { DEMO_USERS } from '@/lib/auth/constants';
import { decrypt } from '@/lib/auth/session';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export default async function Home() {
  const cookieStore = await cookies();
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
    const conv = db
      .prepare(
        'SELECT id FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
      )
      .get(currentUserId) as { id: string } | undefined;

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
            className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-gray-800 transition-opacity hover:opacity-75"
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
          {currentRole !== 'Creator' && (
            <Link
              href="/cockpit"
              className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
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
            initialMessages={initialMessages}
            conversationId={conversationId}
          />
        </div>
      </div>
      {/* Always show in development for persona testing */}
      <RoleSwitcher currentRole={currentRole} />
    </main>
  );
}
