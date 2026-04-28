import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ContentOps Studio — Side Quest Syndicate',
  description:
    'Editorial AI workspace for brand voice, content pillars, and approval flows.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-full">{children}</body>
    </html>
  );
}
