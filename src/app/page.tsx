import { cookies } from 'next/headers';
import Link from 'next/link';
import { RoleSwitcher } from '@/components/auth/RoleSwitcher';
import { ThemeToggle } from '@/components/auth/ThemeToggle';
import { LeaseLensMark } from '@/components/brand/LeaseLensMark';
import {
  LEASELENS_BADGE_MASTHEAD,
  LEASELENS_WORDMARK_MASTHEAD,
} from '@/components/brand/wordmark-classes';
import type { ChatMessageProps } from '@/components/chat/ChatMessage';
import type { ToolEvent } from '@/components/chat/ChatStreamContext';
import { WorkspaceRouterShell } from '@/components/lease/WorkspaceRouterShell';
import { ensureAnonUserExists } from '@/lib/auth/anon-identity';
import { DEMO_USERS } from '@/lib/auth/constants';
import { ensureDemoUsersExist } from '@/lib/auth/ensure-demo-users';
import { decrypt } from '@/lib/auth/session';
import { getLatestConversationForWorkspace } from '@/lib/chat/conversations';
import {
  rehydrateConversationMessages,
  rehydrateToolEvents,
} from '@/lib/chat/rehydrate-history';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import {
  type ActiveLeaseSnapshot,
  getActiveLeaseSnapshot,
} from '@/lib/lease/queries';
import { LEASELENS_STATUS, LEASELENS_VERSION } from '@/lib/version';
import { purgeExpiredWorkspaces } from '@/lib/workspaces/cleanup';
import { SAMPLE_WORKSPACE } from '@/lib/workspaces/constants';
import {
  decodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import {
  ensureAnonWorkspaceExists,
  getActiveWorkspace,
} from '@/lib/workspaces/queries';

export const runtime = 'nodejs';

export default async function Home() {
  const cookieStore = await cookies();

  // Sprint B.14 (#14) — decode the session BEFORE resolving the workspace, so
  // an anonymous visitor is known in time to materialize their OWN workspace
  // (below) instead of falling through to the shared sample.
  const sessionCookie = cookieStore.get('leaselens_session');

  let currentRole: 'Tenant' | 'Reviewer' | 'Admin' = 'Tenant';
  let currentUserId = DEMO_USERS.find((u) => u.role === 'Tenant')?.id;
  let isAnon = false;

  if (sessionCookie) {
    const payload = await decrypt(sessionCookie.value);
    if (payload?.userId) {
      if (payload.anonymous) {
        // Sprint B.14 (#14) — a real per-visitor anonymous identity (public-anon
        // mode). Materialize its users row so the conversations FK holds, and
        // trust the id directly. NEVER fall back to the seeded demo Tenant here
        // — that is exactly the shared-state leak #14 removes (React Team /
        // Dan Abramov: each visitor owns their own state).
        ensureAnonUserExists(db, payload.userId);
        currentRole = 'Tenant';
        currentUserId = payload.userId;
        isAnon = true;
      } else {
        // Sprint 15.2 — self-heal against dev-DB pollution. The role
        // switcher sets a session cookie pointing to a stable demo-user
        // id; if that row is missing (e.g. an integration test wiped it
        // before the .env.test prefix fix landed), the userExists check
        // below would silently demote the user back to Creator and the
        // role tabs would appear broken. Idempotent INSERT OR IGNORE.
        ensureDemoUsersExist(db);

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
  }

  // Sprint 11 (revised) — middleware always issues a workspace cookie when none
  // exists, so it should be present on every request. Null cases: (a) a brief
  // decode race (treated as fresh visit → sample), and (b) a TTL-purged custom
  // workspace whose cookie is still valid (rare; fall back to sample).
  // Sprint B.14 (#14) — an anonymous visitor owns a per-visitor expiring
  // workspace whose id middleware minted into the cookie; materialize its row
  // here (Edge had no DB) so uploads/conversations bind to it and the sample
  // stays read-only demo data.
  const workspaceCookie = cookieStore.get(WORKSPACE_COOKIE_NAME);
  const workspacePayload = workspaceCookie
    ? await decodeWorkspace(workspaceCookie.value)
    : null;
  // Sprint D.20 (#20) — purge-before-resolve on the SSR path (and BEFORE the
  // anon re-materialize below, so a TTL'd-out workspace is deleted with its
  // children rather than resurrected around stale rows).
  purgeExpiredWorkspaces(db);
  if (
    isAnon &&
    workspacePayload &&
    workspacePayload.workspace_id !== SAMPLE_WORKSPACE.id
  ) {
    ensureAnonWorkspaceExists(db, workspacePayload.workspace_id);
  }
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

  // Fetch conversation and messages
  let conversationId: string | null = null;
  let initialMessages: ChatMessageProps[] = [];
  // Sprint 25 — also rehydrate the right-pane red-flag stream and the
  // left-pane PDF metadata from the persisted conversation, so role
  // switches (revalidatePath('/')) and cockpit round-trips don't reset
  // the workspace to the empty state. The Blob URL itself is restored
  // client-side from IndexedDB; see PdfBinaryRepository.
  let initialToolEvents: ToolEvent[] = [];
  let initialActiveLease: ActiveLeaseSnapshot | null = null;

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
      initialToolEvents = rehydrateToolEvents(msgs);
      initialActiveLease = getActiveLeaseSnapshot(db, conversationId);
    }
  }

  return (
    // Sprint 28.13 — workspace is a window-scrolled document. The
    // viewport-clamp from Sprint 26c.10 (h-screen grid + overflow-
    // hidden) was the right call under spec §1.6's "page must not
    // scroll" invariant, but user feedback after Sprint 28.12 was to
    // drop that invariant and let the whole page scroll naturally
    // instead. `min-h-screen` keeps the workspace at least viewport-
    // tall (so an empty Mode A landing doesn't collapse), but the
    // page grows freely with content from Mode B downward.
    //
    // `relative` is kept (was Sprint 28.12) so Tailwind's `.sr-only`
    // spans (which use `position: absolute`) still find `<main>` as
    // their containing block instead of escaping to the viewport.
    // It is positionally inert otherwise.
    <main
      data-theme-surface
      className="relative min-h-screen bg-surface-base font-sans text-fg-default"
    >
      {/* Sprint 26c.2 — header proportions bumped to feel like a real
          masthead, not a thin app chrome. py-3 → py-4 (denser by ~25%);
          the brand box steps up from h-7 to h-10 with rounded-lg, the
          inner mark from h-3.5 to h-5; the wordmark from 15px to 16px
          with tighter tracking. NJSA anchor + LIVE stamp get a slight
          size bump to keep visual balance with the larger lockup. */}
      {/* Sprint 28.13 — sticky brand/role/theme header so it stays
          accessible during deep window scroll. */}
      <header
        data-theme-surface
        className="sticky top-0 z-raised flex shrink-0 items-center justify-between border-b border-neutral-200 bg-surface-card px-8 py-4 dark:border-neutral-800"
      >
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-3.5">
            {/* Sprint 29.x — masthead is the sole LeaseLens wordmark on
                Mode A; hero uses badge + editorial headline only. */}
            <Link
              href="/"
              className="flex items-center gap-3 rounded-md transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2"
            >
              <span className={`h-10 w-10 ${LEASELENS_BADGE_MASTHEAD}`}>
                {/*
                  Sprint 17.2 — bespoke LeaseLensMark replaces the generic
                  lucide FileSearch. Same metaphor (document + magnifying
                  glass), but custom geometry plus a one-shot scan sweep on
                  mount give the brand a real visual signature. See
                  design-system/MASTER.md → Brand mark for the rules.
                  Sprint 26c.2 — mark stepped up from h-3.5 to h-5 (≈20px)
                  inside the larger h-10 surface so the magnifier glyph is
                  legible at a glance.
                */}
                <LeaseLensMark className="h-5 w-5" />
              </span>
              <span
                data-testid="brand-wordmark"
                className={LEASELENS_WORDMARK_MASTHEAD}
              >
                LeaseLens
              </span>
            </Link>
            {/* Sprint 23h — persistent system anchor (the LeaseLens
                equivalent of open-design.ai's "52.5200° N · 13.4050° E"
                coordinate stamp). Identifies the legal-system scope at
                a glance, in mono small-caps so it reads as metadata,
                not a tagline. Hidden on narrow viewports so the brand
                lockup stays clean on mobile. */}
            <span
              aria-hidden="true"
              data-testid="brand-system-anchor"
              className="hidden font-mono text-[11px] tracking-[0.2em] text-fg-subtle uppercase md:inline"
            >
              NJSA · 46:8 · Tenant Law
            </span>
          </div>
          {/* Sprint 27 — Cockpit link only renders when demo mode is on
              AND the viewer is non-Tenant. Tenant-only public deploys
              (LEASELENS_DEMO_MODE=false) never see this affordance,
              keeping the product surface focused on parsing leases. */}
          {env.LEASELENS_DEMO_MODE && currentRole !== 'Tenant' && (
            <Link
              href="/cockpit"
              className="rounded-md px-1 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 focus-visible:ring-offset-2 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              Cockpit
            </Link>
          )}
        </div>
        {/* Phase 10.8 — role switcher relocated from a floating
            bottom-right group (which overlapped the last red-flag
            card) into the global header. Always rendered in dev for
            persona testing.
            Sprint 15.1 — paired with the theme toggle (system/light/dark).
            Sprint 23i — editorial version stamp added at the left of
            this cluster. Mirrors Open Design's masthead "• LIVE ·
            V0.7.0" element — a small status dot + uppercase mono caps
            label that frames the app like a print masthead frames an
            issue. Hidden on narrow viewports so the right side stays
            clean on mobile. */}
        <div className="flex items-center gap-3">
          <span
            data-testid="brand-live-stamp"
            aria-hidden="true"
            className="hidden font-mono text-[11px] tracking-[0.18em] text-fg-subtle uppercase md:inline-flex md:items-center md:gap-1.5"
          >
            {/* Sprint 23k — radar-ping ripple on the LIVE indicator.
                Canonical Tailwind two-layer ping: a static dot with an
                absolutely-positioned sibling that scales + fades to
                read as a notification pulse. `motion-safe:` gate so
                reduced-motion users see only the static dot (the
                ping is decorative reinforcement of the static label,
                not the sole signal — accessibility preserved). */}
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success-600 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success-600" />
            </span>
            {LEASELENS_STATUS} · {LEASELENS_VERSION}
          </span>
          <ThemeToggle />
          {/* Sprint 27 — RoleSwitcher hidden in production (Tenant-only
              public UI). Demo mode (LEASELENS_DEMO_MODE=true) keeps the
              persona toggle available for internal review and stakeholder
              walkthroughs without rewiring auth. */}
          {env.LEASELENS_DEMO_MODE && (
            <RoleSwitcher currentRole={currentRole} />
          )}
        </div>
      </header>
      {/* Sprint 26a — workspace router shell. Routes to ParserLandingShell
          (Mode A, hero dropzone) when no active lease is rehydrated;
          falls through to ParserResultsShell when a lease is active.
          otherwise. Sprint 26b replaces the post-upload branch with the
          new ParserResultsShell; Sprint 26c replaces the FAB stub with
          the real assistant. */}
      <WorkspaceRouterShell
        key={workspace.id}
        initialMessages={initialMessages}
        conversationId={conversationId}
        workspaceName={workspace.name}
        viewerRole={currentRole}
        initialToolEvents={initialToolEvents}
        initialActiveLease={initialActiveLease}
        autoScanEnabled={env.LEASELENS_AUTO_SCAN_ENABLED}
        // Sprint D.19 (#19) — the sample workspaces are never deletable; a
        // visitor's own (non-sample) review gets the Delete-my-review action.
        canDeleteWorkspace={workspace.is_sample === 0}
      />
    </main>
  );
}
