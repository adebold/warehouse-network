import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Skidspace Analytics Dashboard',
  description: 'Real-time analytics and business intelligence for warehouse marketplace',
  keywords: 'analytics, dashboard, warehouse, marketplace, business intelligence',
  authors: [{ name: 'Skidspace Team' }],
  viewport: 'width=device-width, initial-scale=1',
  robots: 'noindex, nofollow' // Private analytics dashboard
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}