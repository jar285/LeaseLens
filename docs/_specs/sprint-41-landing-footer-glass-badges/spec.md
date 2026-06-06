# Sprint 41 — Landing footer + glass trust badges

Method: `development-philosophy.md` (Spec → QA-spec → Sprint → TDD → Code → QA).
Branch: `feature/fab-menu`.

## Goal

Two landing-page (Mode A) refinements requested by the user:

1. **Add a footer** surfacing FAQ, Privacy, and NJ-law sources, so the product
   reads as a finished, trustworthy legal-tech surface rather than ending
   abruptly at the disclaimer line.
2. **Turn the three numbered trust badges** (`01 / 02 / 03`, "the numbers we
   use as signs") into **glassmorphism**, reusing the FAB's frosted recipe so
   the landing gains one premium accent — without making the page chat-first or
   over-using glass.

## Who / why

Tenant-facing landing. Footers + plain-English FAQ/privacy/sources are table
stakes for trust in a legal-adjacent tool (Krug: obvious; Rams: calm + honest;
source-grounded AI: citations are real). The glass badges are an Apple-HIG /
Refactoring-UI polish accent.

## Locked decisions (Spec-QA gate, 2026-06-05)

- **Content delivery = dedicated pages** `/faq`, `/privacy`, `/sources` (real
  routes), linked from the footer. (Chosen over in-page accordions / modals.)
- **Footer style = calm minimal** — flat parchment, hairline top divider, mono
  eyebrow, serif/sans body. **No glass on the footer.** Glass is reserved for
  the badge accent (ui-ux-design-philosophy.md: "use glass as an accent").
- **Footer sections** = brand + tagline (always), FAQ, Privacy & data, NJ law
  sources, plus the "not legal advice" line + copyright (always). **No
  Terminology page** this sprint.
- **Glass scope** = the three circular trust medallions only. The inline "HOW
  IT WORKS" step-strip numerals stay as plain text (they are text, not signs).

## Scope

- **Workstream A** — rewrite `TRUST_METRIC_CIRCLE_CLASS` in `ParserLandingShell`
  to the frosted-glass recipe (translucent parchment + `backdrop-blur` +
  `supports-[backdrop-filter]` step-down + inset top highlight + soft warm
  shadow), and fix the latent Tailwind-v4 transition snap (`transition-transform`
  → `transition-[scale,box-shadow]`, since `scale-*` sets the `scale` property).
- **Workstream B** — `SiteFooter` + `ContentPageShell` (in
  `src/components/layout/`); content modules in `src/lib/content/`
  (`footer`, `faq`, `privacy`, `nj-sources`); three sync server pages; mount the
  footer in `ParserLandingShell`.

## Invariants / guards

- Parser-first: the footer is secondary chrome below the fold and must not
  compete with the hero dropzone. Footer renders on Mode A + the content pages
  only — never in the Mode B workspace.
- Reuse single-source copy: `LEASELENS_DISCLAIMER` (footer + pages) and
  `LEASELENS_DATA_PANEL` (privacy lead) so surfaces can't drift.
- NJ sources grounded in the real seeded corpus (`src/corpus/nj-tenant-law`);
  invent no statutes. No social/contact/company info (none exists in repo).
- WCAG-AA over glass: body `fg-default`, secondary `fg-muted`; never `fg-subtle`
  for real body copy. Visible focus rings, ≥44px touch targets, semantic
  `<footer>`/`<nav>`/headings, color never the only signal.
- No new dependencies. No edits to `page.tsx`, `layout.tsx`, or parser/chat/
  upload logic.

## Definition of done

- TDD red→green for the badge change, the footer, the shell, and each page.
- Footer links resolve to `/faq`, `/privacy`, `/sources`; each page renders the
  brand-home header + content + footer.
- Glass badges read as frosted, hover lift eases (not snaps), numeral legible
  over the glass.
- Gate: lint ✓ · typecheck ✓ · test ✓ · build ✓. Live Playwright verification +
  screenshots.
