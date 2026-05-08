import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LeaseLens — NJ Tenant Lease Red-Flag Reviewer',
  description:
    'Drop a NJ residential lease, get a graded red-flag report grounded in NJ tenant law.',
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
