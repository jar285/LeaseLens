// Sprint B.15 (#15) — requireSessionOrAnon: the single fail-closed
// session+workspace resolver shared by both lease routes. Verifies public-anon
// mode NEVER falls back to the seeded demo Tenant / sample workspace (Robert C.
// Martin: authz at the boundary; Google SRE: fail closed at trust boundaries),
// while the demo/default profile keeps the legacy seeded fallback.

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  SAMPLE_CLEAN_WORKSPACE,
  SAMPLE_WORKSPACE,
} from '@/lib/workspaces/constants';
import {
  encodeWorkspace,
  WORKSPACE_COOKIE_NAME,
} from '@/lib/workspaces/cookie';
import { ensureAnonWorkspaceExists } from '@/lib/workspaces/queries';
import { DEMO_USERS } from './constants';
import { encrypt } from './session';
import type { Role, SessionPayload } from './types';

// Toggle deployment mode via process.env getters (the real env is a cached
// singleton). resolve-session.ts reads it transitively through auth/mode.ts.
vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...actual,
    env: {
      ...actual.env,
      get LEASELENS_PUBLIC_ANON_MODE() {
        return process.env._TEST_PUBLIC_ANON_MODE === 'true';
      },
      get LEASELENS_DEMO_MODE() {
        return process.env._TEST_DEMO_MODE === 'true';
      },
    },
  };
});

import { requireSessionOrAnon } from './resolve-session';

const ACTIVE_WS = '00000000-0000-0000-0000-0000000015a1';
const EXPIRED_WS = '00000000-0000-0000-0000-0000000015e2';
const ABSENT_WS = '00000000-0000-0000-0000-0000000015f3';

const anonSession: SessionPayload = {
  userId: 'anon-visitor-A',
  role: 'Tenant' as Role,
  displayName: 'Anonymous Tenant',
  anonymous: true,
};

async function makeReq(opts: {
  session?: SessionPayload;
  workspaceId?: string;
}): Promise<NextRequest> {
  const req = new NextRequest('http://localhost:3000/api/leases/x', {
    method: 'GET',
  });
  if (opts.session) {
    req.cookies.set('leaselens_session', await encrypt(opts.session));
  }
  if (opts.workspaceId) {
    req.cookies.set(
      WORKSPACE_COOKIE_NAME,
      await encodeWorkspace({
        workspace_id: opts.workspaceId,
        created_workspace_ids: [],
      }),
    );
  }
  return req;
}

describe('requireSessionOrAnon (#15)', () => {
  let priorPublic: string | undefined;
  let priorDemo: string | undefined;

  beforeEach(() => {
    priorPublic = process.env._TEST_PUBLIC_ANON_MODE;
    priorDemo = process.env._TEST_DEMO_MODE;
    delete process.env._TEST_PUBLIC_ANON_MODE;
    delete process.env._TEST_DEMO_MODE;
    // Active non-sample workspace for the requireActiveWorkspace branch.
    ensureAnonWorkspaceExists(db, ACTIVE_WS);
    // Expired-but-unpurged non-sample workspace.
    const past = Math.floor(Date.now() / 1000) - 100;
    db.prepare(
      `INSERT OR IGNORE INTO workspaces (id, name, description, is_sample, created_at, expires_at)
       VALUES (?, 'expired', 'expired', 0, ?, ?)`,
    ).run(EXPIRED_WS, past, past);
  });

  afterEach(() => {
    // Snapshot/restore — vitest shares process.env across files.
    if (priorPublic === undefined) delete process.env._TEST_PUBLIC_ANON_MODE;
    else process.env._TEST_PUBLIC_ANON_MODE = priorPublic;
    if (priorDemo === undefined) delete process.env._TEST_DEMO_MODE;
    else process.env._TEST_DEMO_MODE = priorDemo;
    for (const id of [ACTIVE_WS, EXPIRED_WS, ABSENT_WS]) {
      db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    }
  });

  describe('public-anon mode (fail closed)', () => {
    beforeEach(() => {
      process.env._TEST_PUBLIC_ANON_MODE = 'true';
    });

    it('401s when no session cookie is present (never DEMO_USERS)', async () => {
      const req = await makeReq({ workspaceId: ACTIVE_WS });
      const r = await requireSessionOrAnon(req, db);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(401);
    });

    it('401s when a session is present but no workspace cookie', async () => {
      const req = await makeReq({ session: anonSession });
      const r = await requireSessionOrAnon(req, db);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(401);
    });

    it('401s when the workspace cookie points at the immortal sample workspace', async () => {
      const req = await makeReq({
        session: anonSession,
        workspaceId: SAMPLE_WORKSPACE.id,
      });
      const r = await requireSessionOrAnon(req, db);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(401);
    });

    it('401s when the workspace cookie points at the clean sample workspace', async () => {
      const req = await makeReq({
        session: anonSession,
        workspaceId: SAMPLE_CLEAN_WORKSPACE.id,
      });
      const r = await requireSessionOrAnon(req, db);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(401);
    });

    it('resolves without requiring the workspace row to exist (POST/upload path materializes)', async () => {
      const req = await makeReq({
        session: anonSession,
        workspaceId: ABSENT_WS,
      });
      const r = await requireSessionOrAnon(req, db, {
        requireActiveWorkspace: false,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.userId).toBe(anonSession.userId);
        expect(r.role).toBe('Tenant');
        expect(r.workspaceId).toBe(ABSENT_WS);
      }
    });

    it('401s on the read path when the workspace is missing (requireActiveWorkspace)', async () => {
      const req = await makeReq({
        session: anonSession,
        workspaceId: ABSENT_WS,
      });
      const r = await requireSessionOrAnon(req, db, {
        requireActiveWorkspace: true,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(401);
    });

    it('401s on the read path when the workspace has expired', async () => {
      const req = await makeReq({
        session: anonSession,
        workspaceId: EXPIRED_WS,
      });
      const r = await requireSessionOrAnon(req, db, {
        requireActiveWorkspace: true,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(401);
    });

    it('resolves on the read path for an active per-visitor workspace', async () => {
      const req = await makeReq({
        session: anonSession,
        workspaceId: ACTIVE_WS,
      });
      const r = await requireSessionOrAnon(req, db, {
        requireActiveWorkspace: true,
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.userId).toBe(anonSession.userId);
        expect(r.workspaceId).toBe(ACTIVE_WS);
      }
    });
  });

  describe('demo/default mode (behavior-preserving fallback)', () => {
    it('falls back to the seeded Tenant + sample workspace with no cookies', async () => {
      const req = await makeReq({});
      const r = await requireSessionOrAnon(req, db);
      expect(r.ok).toBe(true);
      if (r.ok) {
        const seededTenant = DEMO_USERS.find((u) => u.role === 'Tenant');
        expect(r.userId).toBe(seededTenant?.id);
        expect(r.role).toBe('Tenant');
        expect(r.workspaceId).toBe(SAMPLE_WORKSPACE.id);
      }
    });

    it('trusts a valid session cookie and its workspace cookie', async () => {
      const demoUser = DEMO_USERS.find((u) => u.role === 'Reviewer');
      if (!demoUser) throw new Error('no Reviewer demo user');
      const req = await makeReq({
        session: {
          userId: demoUser.id,
          role: demoUser.role,
          displayName: demoUser.display_name,
        },
        workspaceId: ACTIVE_WS,
      });
      const r = await requireSessionOrAnon(req, db);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.userId).toBe(demoUser.id);
        expect(r.role).toBe('Reviewer');
        expect(r.workspaceId).toBe(ACTIVE_WS);
      }
    });
  });
});
