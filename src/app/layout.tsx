import './globals.css';
import type { Metadata } from 'next';
import { Geist, Geist_Mono, Source_Serif_4 } from 'next/font/google';

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  // Sprint 23i — added 700 + italic style for the Open-Design-inspired
  // editorial hero treatment: bold upright body words with one italic
  // word as emphasis ("Find what to /negotiate/, before you sign.").
  // Without an explicit italic in the loader, browsers synthesise it
  // from the upright face, which looks measurably worse than Source
  // Serif 4's real italics.
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-source-serif',
  display: 'swap',
});

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
      <body className="h-full">{children}</body>
    </html>
  );
}
