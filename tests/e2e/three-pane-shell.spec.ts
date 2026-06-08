// Sprint 25.2 — three-pane shell + Sprint 25 state preservation.
//
// Covers:
//   preflight: page renders three-pane shell with default Tenant role
//   T1 — upload PDF, dropzone → PdfViewer, scan triggers extract_clauses tool
//   T2 — role switch preserves state, NO shell remount (R1 load-bearing)
//   T3 — cockpit round-trip restores the loaded state from IndexedDB
//   T4 — IndexedDB cache miss falls back to the reattach pane

import { expect, test } from '@playwright/test';
import { DEMO_USERS } from '@/lib/auth/constants';
import { db } from '@/lib/db';
import { openAssistantFab } from './helpers/open-assistant-fab';
import { clearUserConversations } from './helpers/seed-gradings';
import { setSessionCookies } from './helpers/session';
import { uploadSampleLease } from './helpers/upload-sample-lease';

const TENANT_ID = DEMO_USERS.find((u) => u.role === 'Tenant')!.id;
const REVIEWER_ID = DEMO_USERS.find((u) => u.role === 'Reviewer')!.id;

/**
 * Polls the DB until the given user's latest conversation has an
 * active_lease_id bound. /api/chat sets this via the recent-upload
 * fallback after the user sends the first message post-upload.
 */
async function waitForActiveLeaseBinding(userId: string) {
  await expect
    .poll(
      () => {
        const row = db
          .prepare(
            'SELECT active_lease_id FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
          )
          .get(userId) as { active_lease_id: string | null } | undefined;
        return row?.active_lease_id ?? null;
      },
      { timeout: 30_000, intervals: [250, 500, 1000] },
    )
    .not.toBeNull();
}

test.beforeEach(async ({ context }) => {
  // Wipe conversations seeded by prior specs so SSR rehydration sees an
  // empty state (the home-page query loads the latest conversation for
  // the role's user). Workers: 1 + shared DB means state otherwise
  // leaks across tests and files.
  clearUserConversations(TENANT_ID);
  clearUserConversations(REVIEWER_ID);
  await setSessionCookies(context, 'Tenant');
});

test('preflight — empty homepage renders Mode A, ParserResultsShell appears after upload', async ({
  page,
}) => {
  // Sprint 26a + 26b — homepage with no rehydrated active lease now
  // renders ParserLandingShell (Mode A). Uploading a sample PDF lifts
  // the router into Mode B, which Sprint 26b changed from the legacy
  // LeaseLensWorkspaceShell to ParserResultsShell.
  await page.goto('/');

  await expect(page.getByTestId('parser-landing-shell')).toBeVisible();
  await expect(page.getByTestId('lease-hero-headline')).toBeVisible();
  await expect(page.getByTestId('lease-upload-dropzone')).toBeVisible();
  // Mode A intentionally omits the chat composer; the FAB stub claims
  // the bottom-right slot.
  await expect(page.getByTestId('chat-composer')).toHaveCount(0);
  await expect(page.getByTestId('assistant-fab')).toBeVisible();

  await uploadSampleLease(page);
  await expect(page.getByTestId('parser-results-shell')).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId('results-pdf-pane')).toHaveAttribute(
    'data-state',
    'loaded',
  );
  await expect(page.getByTestId('results-stack')).toBeVisible();
  // Sprint 26c.10 — auto-scan fires on upload, so the red-flags pane is in its
  // scanning state here (not the pre-scan empty state); assert the section
  // itself renders, not a transient empty/scanning sub-state.
  await expect(page.getByTestId('results-red-flags-section')).toBeVisible();
  await expect(page.getByTestId('clauses-list')).toBeVisible();
  // Sprint 26c — the temporary chat slot is gone; chat lives in the
  // FAB drawer. The pill itself anchors the bottom-right.
  await expect(page.getByTestId('results-chat-slot')).toHaveCount(0);
  await expect(page.getByTestId('assistant-fab')).toBeVisible();

  await expect(page.getByTestId('role-switcher-tenant')).toHaveAttribute(
    'data-active',
    'true',
  );
});

test('T1 — upload PDF, ParserResultsShell mounts, scan triggers tool flow', async ({
  page,
}) => {
  await page.goto('/');

  await uploadSampleLease(page);

  // /api/leases parses + segments the PDF — 2–8s on warm cache.
  await expect(page.getByTestId('results-pdf-pane')).toHaveAttribute(
    'data-state',
    'loaded',
    { timeout: 30_000 },
  );
  await expect(page.getByTestId('pdf-viewer-filename')).toContainText(
    'sample-nj-residential-lease.pdf',
  );

  // Sprint 26c.10 — auto-scan-on-upload fires the standard scan automatically.
  // Its extract_clauses tool flow (via LEASELENS_E2E_MOCK) runs SILENTLY and
  // routes into parser state, populating ClausesList — assert the clause rows
  // appear to confirm the scan's tool flow ran. (Auto-scan consumes the scan
  // turn, so a manual chat scan no longer yields a chat-surface ScanTimeline;
  // and the mock emits no grade_clause_severity gradings, so RedFlagReport stays
  // empty — visible red-flag cards are covered in red-flag-interactions.spec.ts
  // via direct DB seeding.)
  await expect(page.getByTestId('clauses-list-row').first()).toBeVisible({
    timeout: 30_000,
  });

  // The mock does NOT emit grade_clause_severity gradings — visible red-flag
  // cards are covered in red-flag-interactions.spec.ts via direct DB seeding.
});

test('T2 — role switch does NOT remount the shell (R1 DOM-identity invariant)', async ({
  page,
}) => {
  await page.goto('/');
  await uploadSampleLease(page);
  await expect(page.getByTestId('results-pdf-pane')).toHaveAttribute(
    'data-state',
    'loaded',
    { timeout: 30_000 },
  );

  // Sprint 25.1 (R1) load-bearing observable: capture the post-upload
  // shell's DOM node BEFORE the role click. After the click, the SAME
  // node must still be connected. Under the pre-R1 revalidatePath path,
  // React would have torn down the subtree and rebuilt it — the
  // original element would be detached.
  //
  // Role switch *content* legitimately changes (each demo role is a
  // different user with their own conversation history) — that's by
  // design. R1 is about NOT REMOUNTING the React tree on every
  // session-cookie write; the content swap is expected.
  const shellHandle = await page
    .getByTestId('parser-results-shell')
    .elementHandle();
  if (!shellHandle) throw new Error('parser-results-shell element not found');

  await page.getByTestId('role-switcher-reviewer').click();
  await expect(page.getByTestId('role-switcher-reviewer')).toHaveAttribute(
    'data-active',
    'true',
  );

  const stillConnected = await shellHandle.evaluate((el) => el.isConnected);
  expect(stillConnected).toBe(true);
});

test('T3 — cockpit round-trip restores loaded state from IndexedDB', async ({
  page,
}) => {
  // Reviewer can navigate to /cockpit; Tenant is redirected away.
  await page.context().clearCookies();
  await setSessionCookies(page.context(), 'Reviewer');

  await page.goto('/');
  await uploadSampleLease(page);
  await expect(page.getByTestId('results-pdf-pane')).toHaveAttribute(
    'data-state',
    'loaded',
    { timeout: 30_000 },
  );

  // Send a chat turn so /api/chat's recent-upload fallback binds
  // active_lease_id on a fresh conversation row. Sprint 26c — open the
  // FAB drawer to reach the composer. Reviewer doesn't render
  // <ScanTimeline /> (that's Tenant-only per Sprint 18 §5), so poll
  // the DB instead.
  await openAssistantFab(page);
  await page.getByRole('textbox').fill('Scan this lease.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await waitForActiveLeaseBinding(REVIEWER_ID);

  await page.getByRole('link', { name: 'Cockpit' }).click();
  await expect(page).toHaveURL(/\/cockpit$/);

  // Navigate back via direct goto — more robust than guessing at the
  // cockpit page's brand-link markup, which differs from the home page.
  await page.goto('/');
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/?$/);

  // SSR returns with the active-lease snapshot (no pdfUrl); the
  // useLeftPaneState effect looks up the bytes in IndexedDB and promotes
  // the state to "loaded". Assert the end state — the intermediate
  // "restoring" can be instantaneous on fast machines.
  await expect(page.getByTestId('results-pdf-pane')).toHaveAttribute(
    'data-state',
    'loaded',
    { timeout: 10_000 },
  );
  await expect(page.getByTestId('pdf-viewer-filename')).toContainText(
    'sample-nj-residential-lease.pdf',
  );
});

test('T4 — IndexedDB cache miss → reattach state surfaces the lost-cache hint', async ({
  page,
}) => {
  // Sprint 26b — the ParserResultsShell reattach branch is a hint card
  // pointing at the Replace button (the dedicated dropzone surface lives
  // back on Mode A after Replace). The legacy three-pane shell's
  // inline reattach dropzone is gone; recovery now goes via Replace.
  await page.goto('/');
  await uploadSampleLease(page);
  await expect(page.getByTestId('results-pdf-pane')).toHaveAttribute(
    'data-state',
    'loaded',
    { timeout: 30_000 },
  );

  // Send a chat turn so /api/chat's recent-upload fallback binds
  // active_lease_id on a fresh conversation row. Without this, page.tsx's
  // getActiveLeaseSnapshot returns null after reload and the rehydrate
  // path can't trigger the reattach state. Sprint 26c — open the FAB
  // drawer to reach the composer.
  await openAssistantFab(page);
  await page.getByRole('textbox').fill('Scan this lease.');
  await page.getByRole('button', { name: 'Send message' }).click();
  await waitForActiveLeaseBinding(TENANT_ID);

  // Wipe the IndexedDB store, then reload. SSR rehydration now returns
  // the active-lease snapshot from SQLite, but useLeftPaneState's lookup
  // misses — state machine terminates in 'reattach'.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('leaselens-pdf-cache');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      }),
  );
  await page.reload();

  await expect(page.getByTestId('results-pdf-pane')).toHaveAttribute(
    'data-state',
    'reattach',
    { timeout: 10_000 },
  );

  // The reattach hint surfaces the filename + a pointer to Replace as
  // the recovery affordance.
  const pdfPane = page.getByTestId('results-pdf-pane');
  await expect(pdfPane).toContainText('sample-nj-residential-lease.pdf');
  await expect(pdfPane).toContainText(/replace/i);
  await expect(page.getByTestId('results-replace-button')).toBeVisible();
});
