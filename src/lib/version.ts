// Editorial masthead constants for the global header. Hoisted out of
// page.tsx (Sprint 27) so deploys can bump the version without
// touching the layout. The "Live" status mirrors print-magazine
// mastheads — a static label for now; later sprints can derive it
// from a build-time env var or a runtime health probe.

export const LEASELENS_VERSION = 'v23.i';
export const LEASELENS_STATUS = 'Live';
