import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en" suppressHydrationWarning>
      <Head>
        <link rel="icon" type="image/svg+xml" href="/brand/logo-icon.svg" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <meta name="theme-color" content="#0B5FFF" />
      </Head>
      <body className="bg-background min-h-screen font-sans antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
