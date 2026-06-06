# Sprint 41 — Implementation Notes & QA Report

Landing footer + glass trust badges. Spec: [`spec.md`](spec.md). Method:
`development-philosophy.md` (Spec → QA-spec → Sprint → TDD → Code → QA).

## 1. What was completed

### Workstream A — glass trust badges
- Rewrote `TRUST_METRIC_CIRCLE_CLASS` in
  [`ParserLandingShell.tsx`](../../../src/components/lease/ParserLandingShell.tsx)
  to the FAB's frosted recipe scaled for a 56px circle: `bg-surface-card/80` +
  `backdrop-blur-md` + `supports-[backdrop-filter]:bg-surface-card/65` (+ dark
  `neutral-900/70` → `/55`), `border-border-hairline`, depth via an **inset top
  highlight + soft warm drop shadow** (box-shadow, cleaner than a `before:`
  line on a circle).
- **Fixed the latent Tailwind-v4 snap bug:** the old `transition-transform`
  never animated `hover:scale-105` because v4 sets `scale` as its own CSS
  property. Now `transition-[scale,box-shadow]` (kept the `motion-safe` hover /
  `motion-reduce` guards the test pins).
- Numeral bumped `text-accent-600 → text-accent-700` for legibility over the
  lighter glass (live-measured ~5.26:1, exceeds AA; the medallion is `aria-hidden`
  and the label below carries the meaning).

### Workstream B — footer + content pages
- **Content modules** (`src/lib/content/`, single-source `as const`):
  `footer.ts`, `faq.ts` (6 grounded Q&As), `privacy.ts` (reuses
  `LEASELENS_DATA_PANEL` as the lead + 4 sections), `nj-sources.ts` (7 sources
  grounded in the seeded corpus, statutes verified against the source files).
- **`SiteFooter`** (`src/components/layout/`, directive-less) — calm-minimal:
  hairline top divider on flat parchment, brand + tagline, a
  `<nav aria-label="Resources">` of three `next/link` anchors, and the reused
  `LEASELENS_DISCLAIMER` + `© {year} LeaseLens`. **No glass.**
- **`ContentPageShell`** (`src/components/layout/`, directive-less) — slim
  brand-lockup-links-home `<header>` (reuses `LeaseLensMark` +
  `LEASELENS_WORDMARK_MASTHEAD`, no theme toggle / role switcher / version
  stamp), an editorial title block (mono eyebrow + serif `<h1>` + intro), and
  the shared `SiteFooter`. Banner + main + contentinfo are proper landmarks.
- **Three sync server pages** with per-page `metadata`: `app/faq/page.tsx`,
  `app/privacy/page.tsx`, `app/sources/page.tsx` (no `runtime`/`dynamic` → Next
  statically prerenders them).
- **Mounted** `<SiteFooter/>` in `ParserLandingShell` as a sibling after the
  hero `</section>` (Mode A only; below the fold; never competes with the
  dropzone).

## 2. Files changed
- `src/components/lease/ParserLandingShell.tsx` — glass badge class + footer mount.
- New: `src/components/layout/SiteFooter.tsx`, `ContentPageShell.tsx`.
- New: `src/lib/content/{footer,faq,privacy,nj-sources}.ts`.
- New routes: `src/app/{faq,privacy,sources}/page.tsx`.
- Tests (colocated): `SiteFooter.test.tsx`, `ContentPageShell.test.tsx`,
  `app/{faq,privacy,sources}/page.test.tsx`, and additions to
  `ParserLandingShell.test.tsx`.
- Docs + screenshots in this folder.
- (No `globals.css` change — reused existing tokens; the glass uses arbitrary
  box-shadow values for the inset highlight.)

## 3. Tests added (TDD red→green)
- ParserLandingShell: badge renders frosted glass (`backdrop-blur`,
  `supports-[backdrop-filter]`, `bg-surface-card/`, `transition-[scale`, NOT
  `transition-transform`); footer renders as a **sibling** of the hero section.
- SiteFooter (5): contentinfo landmark; three resource hrefs; reused disclaimer
  + current-year copyright; `min-h-11` + focus-ring on links; calm-minimal
  invariant (`border-t` hairline, no `backdrop-blur`/`shadow-lift`).
- ContentPageShell (4): banner + main + footer; brand lockup links `/`; eyebrow
  + title + intro + children; header carries no controls (no theme toggle).
- Pages (3): each renders its content constant(s) + the footer; privacy asserts
  `LEASELENS_DATA_PANEL.headline` to prove the reuse/no-drift guard.

### Footer fill (follow-up — balance the brand column)
- User flagged a void below the tagline (the brand column sat shorter than the
  Resources column). Filled it with a compact **"what you get" highlights list**
  in `SiteFooter` — the three `LEASELENS_TRUST_METRICS` ("15+ clauses checked" /
  "Every flag cites NJSA" / "Plain-English explanations"), each with a small
  terracotta `Check` (lucide) icon. Reused single-source (no drift from the
  landing badges); purely additive on the content pages, which don't show those
  stats above the fold. +1 test (`fills the brand column … highlights`).
  Screenshot: [`s41-footer-filled.png`](screenshots/s41-footer-filled.png).
- **Expanded the footer tagline** (`LEASELENS_FOOTER.tagline`) from the one-liner
  to a fuller value statement — "New Jersey residential lease review, grounded in
  tenant law — built to help tenants read their lease in plain English and spot
  what is worth negotiating before they sign." Keeps the brand voice; distinct
  register from the highlights (proof) and the disclaimer (legal caveat).
  Copy-only change in the content module (type-safe, no test pins the marketing
  copy). Screenshot:
  [`s41-footer-expanded-tagline.png`](screenshots/s41-footer-expanded-tagline.png).

## 4. Test status — **PASS**
- **lint ✓ · typecheck ✓ · test ✓ · build ✓** — full suite **1200 passed** (131
  files; +15 vs the prior 1185). Build run with the dev server stopped
  (`next build` clobbers a live `next dev`'s `.next`); `/faq`, `/privacy`,
  `/sources` prerender as **○ Static**.

## 5. Live verification (Playwright, `npm run dev`)
- **Glass badge** (probed live, as the dev seed re-attaches the sample lease so
  Mode A is gated): the class compiles to `backdrop-filter: blur(12px)`, 65%
  translucent fill, `transition-property: scale, box-shadow` (snap fixed), inset
  highlight present, accent-700 numeral ~**5.26:1** over the glass.
- **Content pages** `/faq`, `/privacy`, `/sources` — all 200, render the
  brand-home header + content + footer; footer link click-through navigates
  (`/privacy` footer → `/faq`); **0 console errors**; light + dark both legible.
- Screenshots: [`s41-faq-page.png`](screenshots/s41-faq-page.png),
  [`s41-sources-page.png`](screenshots/s41-sources-page.png),
  [`s41-privacy-page.png`](screenshots/s41-privacy-page.png),
  [`s41-faq-dark.png`](screenshots/s41-faq-dark.png).

## 6. Power words applied
- **Steve Krug / Dieter Rams** — calm, flat footer; one glass accent, not glass
  everywhere; plain FAQ/privacy copy.
- **Apple HIG / Wathan-Schoger** — frosted medallions with inset-highlight depth
  and an eased (no-snap) hover lift.
- **WCAG** — AA over glass, focus rings, 44px targets, semantic landmarks,
  color never the only signal.
- **Source-grounded AI / Ward Cunningham** — `/sources` lists real NJ statutes
  verified against the seeded corpus; the pivot's privacy stance is now a
  durable page, not just in-chat copy.
- **Martin Fowler** — behavior-preserving: a footer + new static pages + a CSS
  accent; no parser/chat/upload code touched.

## 7. Accessibility checks
- Footer is a `contentinfo` landmark with a labelled `Resources` nav; links have
  visible focus rings + `min-h-11` touch targets; disclaimer/secondary copy uses
  `fg-muted` (AA), never `fg-subtle`. Content-page header is a single `banner`
  with only the home link. Dark mode legible. 0 console errors.

## 8. Risks / follow-up
- **Build gate not yet run** (dev was live) — must pass `npm run build` with dev
  stopped before merge.
- **Mode-A landing footer/badges not seen live** — gated by the dev seed
  re-attaching the sample lease on the Replace revalidate. Covered by unit tests
  (classes + sibling), the live CSS probe, and the identical footer rendering on
  the content pages.
- Footer is intentionally **not** in the Mode B workspace; if a workspace footer
  is later wanted, it's a separate decision.

---

## Sprint 42 — footer expansion (multi-column + more pages)

After Sprint 41 shipped, the user compared the footer to CloudConvert's and
asked what else to add. I researched current footer/legal best practices
(separate dedicated pages for Privacy/Terms/Accessibility; footer is prime
trust real-estate) and proposed a tailored set — explicitly **declining** to
fabricate a company entity, address, Contact Us, Blog, Status, social links, or
security badges (none exist in the repo; faking trust signals backfires).

### Delivered (all four picks + multi-column + theme toggle)
- **Multi-column footer.** `SiteFooter` restructured into a brand block +
  **Product** (Upload a lease, How it works) / **Resources** (FAQ, Terminology,
  NJ law sources) / **Legal** (Privacy & data, Terms of use, Accessibility)
  columns, all inside one labelled `<nav aria-label="Footer">`.
- **Tenant-help column** — three **verified** external resources (Legal Services
  of NJ, NJ Courts Landlord/Tenant, NJ.gov renter help), each `target="_blank"
  rel="noopener noreferrer"` with an `ArrowUpRight` glyph + sr-only "(opens in a
  new tab)". Delivers on the disclaimer's "consult a legal-aid clinic."
- **Theme toggle**, gated by `showThemeToggle`: content pages pass it (their
  header has none); the landing omits it (its masthead already has one — avoids
  two desyncing toggles).
- **Three new pages** (sync server components, `○ Static`): `/terms`,
  `/accessibility`, `/terminology`, with single-source content modules
  (`terms.ts`, `accessibility.ts`, `terminology.ts`, `tenant-help.ts`) and the
  restructured `footer.ts` (`columns`).
- **`#how-it-works` anchor** added to the landing support section (with
  `scroll-mt-24` for the sticky header) so the footer Product link resolves.
- **Smooth in-page scroll** (user follow-up) for the two same-page footer links:
  `SiteFooter` is now a client component with a reduced-motion-aware handler —
  "Upload a lease" (`/`) glides to the top of the landing, "How it works"
  (`/#how-it-works`) glides to that section, instead of the browser's instant
  jump. It only intercepts when the target is on the current page (cross-page
  clicks fall through to normal navigation); reuses `prefersReducedMotion()`
  (→ instant when reduce is set). This is deliberately scoped to the two links
  rather than a global `html { scroll-behavior: smooth }`, which would have
  smoothed every route-change scroll-to-top app-wide (workspace, cockpit).

### Tests / gate — **PASS**
- New `/terms`, `/accessibility`, `/terminology` page tests; expanded
  `SiteFooter.test` (Footer nav, 8 internal links + hrefs, external links open
  safely, gated toggle) and `ContentPageShell.test` (toggle in footer, not
  banner). **lint ✓ · typecheck ✓ · test ✓ (1206 passed, 134 files) · build ✓**
  (all six content pages prerender `○ Static`).
- Live (Playwright): `/terms` renders the multi-column footer; external links
  carry the right `https`/`target`/`rel`; the footer theme toggle cycles →
  applies `.dark` → persists to localStorage; **0 console errors**. Reached a
  lease-free **Mode A** via `POST /api/workspaces/select-clean-sample` and
  confirmed: the glass trust badges render live (light + dark), and the smooth
  scroll animates — clicking "How it works" glided `scrollY` 866→849→815→741→
  …→544 (settled at the section) and set `#how-it-works` with no reload;
  "Upload a lease" glided toward the top. Screenshots:
  [`s42-terms-page.png`](screenshots/s42-terms-page.png),
  [`s42-footer-multicolumn.png`](screenshots/s42-footer-multicolumn.png),
  [`s41-glass-badges-light.png`](screenshots/s41-glass-badges-light.png),
  [`s41-glass-badges-live.png`](screenshots/s41-glass-badges-live.png) (dark).

### Browser favicon (user follow-up)
- Added **`src/app/icon.svg`** (Next App Router metadata-file convention → Next
  auto-emits `<link rel="icon" type="image/svg+xml" sizes="any">`, no layout
  edit). It's the `LeaseLensMark` glyph (document + scan magnifier) as a white
  lockup on the brand accent-600 (#cc6347) rounded square — mirrors the masthead
  brand box and reads on both light and dark tab bars. Strokes are slightly
  bolder than the in-app mark for 16px legibility. No prior favicon existed
  (`src/app`/`public` had none). Static asset → no lint/typecheck/test impact;
  verified live (link in head, `/icon.svg` 200 `image/svg+xml`, renders crisp at
  16/24/32/48) and in the production build (emitted to `.next`). Preview:
  [`s42-favicon-preview.png`](screenshots/s42-favicon-preview.png).

### Deliberately NOT added (would be fabrication)
Company legal entity + address, Contact Us (no inbox/backend), Blog, Status
page, social links, newsletter, SOC2/GDPR-style security badges. The
accessibility statement omits a feedback email for the same reason (none
exists); add one when there's a real channel.
