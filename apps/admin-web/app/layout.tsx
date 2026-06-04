import './design-tokens.css';
// globals.css was split into ordered chunks (design-system Phase 4 — the 27k-line
// file became unmanageable). These MUST stay in this exact order: the cascade
// depends on it (later rules override earlier). Concatenated, they are byte-for-byte
// the former globals.css. Keep this list in sync with app/lib/global-css-source.ts.
import './globals.css';
import './globals-02-saas-refresh.css';
import './globals-03-quote-detail.css';
import './globals-04-quote-builder.css';
import './globals-05-platform-scale.css';
import './globals-06-responsive-audit.css';
import './redesign.css';
import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'DMC Admin',
  description: 'Admin interface for the DMC travel platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
