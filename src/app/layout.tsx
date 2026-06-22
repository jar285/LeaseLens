import './globals.css';
import type { Metadata } from 'next';
// Sprint 53 — fonts are now self-hosted (vendored latin variable .woff2 loaded
// via next/font/local in ./fonts.ts) so `next build` never fetches Google's CDN
// and succeeds offline. The `--font-*` variable contract is unchanged, so
// globals.css `@theme` and the `<html>` className below are untouched.
import { geistMono, geistSans, sourceSerif } from './fonts';

export const metadata: Metadata = {
  title: 'LeaseLens — NJ Tenant Lease Red-Flag Reviewer',
  description:
    'Drop a NJ residential lease, get a graded red-flag report grounded in NJ tenant law.',
};

// Sprint 15.1 — no-FOUC theme script. Runs synchronously inside <head>
// before the body renders, reads localStorage.theme ('system'|'light'|'dark'),
// and adds .dark to <html> when the resolved theme is dark. Without this,
// a manual dark-mode pref would flash light during hydration.
const themeScript = `
(function(){
  try {
    var stored = localStorage.getItem('leaselens_theme');
    var theme = stored || 'system';
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = theme === 'dark' || (theme === 'system' && systemDark);
    var root = document.documentElement;
    if (isDark) root.classList.add('dark');
    root.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`.trim();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: the no-FOUC script in <head> below sets
    // .dark + data-theme on <html> before React hydrates, based on
    // localStorage and matchMedia (both client-only). The server can't
    // know the user's preference, so its rendered <html> attributes
    // intentionally differ from the client's. This flag tells React to
    // accept that mismatch on this one element only — it does not
    // propagate to children. Same pattern used by next-themes.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable}`}
    >
      <head>
        {/** biome-ignore lint/security/noDangerouslySetInnerHtml: trusted no-FOUC theme script — content is a static template literal, no user input. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (Grammarly, etc.)
          inject attributes onto <body> (data-gr-ext-installed,
          data-new-gr-c-s-check-loaded, …) before React hydrates, which
          otherwise trips a body-level hydration mismatch warning. This
          suppresses the warning for the <body> element's own attributes
          only — it does NOT propagate to children, so real mismatches
          inside the app still surface. */}
      <body className="h-full" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
