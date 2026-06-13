// Editorial masthead constants for the global header. Hoisted out of
// page.tsx (Sprint 27) so deploys can bump the version without
// touching the layout. The "Live" status mirrors print-magazine
// mastheads — a static label for now; later sprints can derive it
// from a build-time env var or a runtime health probe.

// Sprint 49 — replaced the internal sprint stamp ('v23.i') with the public
// product version for the real-user launch. Mirrors package.json (1.0.0);
// bump here on release (or derive from a build env var in a later sprint).
export const LEASELENS_VERSION = 'v1.0';
export const LEASELENS_STATUS = 'Live';
