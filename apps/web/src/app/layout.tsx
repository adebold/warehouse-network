import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { SessionProvider } from '@/components/providers/session-provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Skidspace - Warehouse Network Platform',
  description: 'Multi-tenant SaaS platform for warehouse management and e-bike logistics',
  keywords: ['warehouse', 'logistics', 'e-bike', 'SaaS', 'inventory', 'management'],
  authors: [{ name: 'Skidspace Team' }],
  openGraph: {
    title: 'Skidspace - Warehouse Network Platform',
    description: 'Multi-tenant SaaS platform for warehouse management and e-bike logistics',
    url: 'https://skidspace.com',
    siteName: 'Skidspace',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Skidspace Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Skidspace - Warehouse Network Platform',
    description: 'Multi-tenant SaaS platform for warehouse management and e-bike logistics',
    images: ['/og-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
  },
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({
  children,
}: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}