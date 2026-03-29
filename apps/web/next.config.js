/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
    optimizeCss: true,
    scrollRestoration: true,
  },

  // PWA Configuration
  async headers() {
    return [
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/manifest+json',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/javascript',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  // Mobile optimization
  async rewrites() {
    return [
      {
        source: '/mobile/:path*',
        destination: '/mobile/:path*',
      },
    ];
  },

  // Image optimization for mobile
  images: {
    domains: [
      'lh3.googleusercontent.com',
      'avatars.githubusercontent.com',
      'images.unsplash.com'
    ],
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Environment variables for mobile features
  env: {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID: process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID,
    NEXT_PUBLIC_APPLE_MERCHANT_ID: process.env.NEXT_PUBLIC_APPLE_MERCHANT_ID,
  },

  // Webpack configuration for PWA
  webpack: (config, { dev, isServer }) => {
    // PWA Service Worker registration
    if (!dev && !isServer) {
      config.resolve.fallback = {
        fs: false,
        path: false,
      };
    }

    // Mobile-specific optimizations
    if (!dev) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: false,
          vendors: false,
          // Separate chunk for mobile components
          mobile: {
            name: 'mobile',
            test: /[\\/]components[\\/]mobile[\\/]/,
            chunks: 'all',
            enforce: true,
          },
          // Common chunk for shared utilities
          common: {
            name: 'common',
            minChunks: 2,
            chunks: 'all',
            enforce: true,
          },
        },
      };
    }

    return config;
  },

  // Security headers for mobile
  poweredByHeader: false,

  // Compression for mobile performance
  compress: true,

  // Trailing slash for consistent URLs
  trailingSlash: false,

  // ESLint configuration
  eslint: {
    dirs: ['pages', 'components', 'lib', 'hooks', 'src'],
  },

  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard',
        permanent: false,
        has: [
          {
            type: 'cookie',
            key: 'next-auth.session-token'
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig