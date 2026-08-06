import { LEASELENS_DATA_PANEL } from '@/lib/lease/landing-panels';

// Sprint 41 — Privacy & data content for /privacy. The lead reuses the
// landing privacy panel verbatim (LEASELENS_DATA_PANEL) so the two surfaces
// cannot drift; the sections expand on the same facts.

export const LEASELENS_PRIVACY = {
  lead: LEASELENS_DATA_PANEL,
  sections: [
    {
      id: 'in-session',
      heading: 'Analyzed in your session',
      body: 'When you upload a lease, LeaseLens extracts its clauses and grades them for this review. The analysis serves your session — it is not sold, shared, or used to train anything.',
    },
    {
      id: 'not-in-corpus',
      heading: 'Your lease never joins the law corpus',
      body: 'The NJ tenant-law corpus that powers citations is the only thing in the searchable index. Your lease PDF and its clauses are kept separate and are never embedded into that public index.',
    },
    {
      id: 'on-device-cache',
      heading: 'Cached on your device, cleared on Replace',
      body: 'Your PDF is cached in your browser (IndexedDB) so the viewer can re-open it without re-uploading. Using Replace in the workspace header revokes the active file and evicts those cached bytes.',
    },
    // Sprint D.19 (#19) — honest temporary storage: the retention promise the
    // product actually enforces. Sprint D.24 review — phrased to match the
    // mechanism exactly: expiry (inaccessible at 24h) is guaranteed at the
    // boundary; row deletion happens via routine cleanup on subsequent
    // requests, not a clock-scheduled job. Only "Delete my review" promises
    // IMMEDIATE deletion, because only it deletes synchronously.
    {
      id: 'retention',
      heading: 'Expires automatically, or delete it now',
      body: 'Your review is temporary by design: the lease, its clauses, red flags, and chat expire 24 hours after you start your review. From that point they are no longer accessible and are removed from our server by routine cleanup. Want it gone immediately? "Delete my review" in the workspace header permanently deletes everything on the server right away and clears this browser’s cached copy.',
    }
    {
      id: 'not-legal-advice',
      heading: 'Informational, not legal advice',
      body: 'LeaseLens helps you understand and prepare — it does not replace a lawyer. Treat every grading and draft as a prompt for your own review.',
    },
  ],
} as const;
