import type { AppProps } from 'next/app';
import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';
import { initGA } from '@/lib/analytics';
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';
import { ThemeProvider } from 'next-themes';
import '../styles/globals.css';

function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  useEffect(() => {
    // Initialize Google Analytics
    const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    if (typeof window !== 'undefined' && measurementId && measurementId !== 'G-XXXXXXXXXX') {
      try {
        initGA(measurementId);
      } catch (error) {
        console.warn('Google Analytics initialization failed:', error);
      }
    }
  }, []);

  return (
    <SessionProvider session={session}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {/* Google Analytics Script */}
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
        <Component {...pageProps} />
      </ThemeProvider>
    </SessionProvider>
  );
}

export default MyApp;
