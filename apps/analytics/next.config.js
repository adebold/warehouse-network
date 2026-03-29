/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true
  },
  transpilePackages: ['@skidspace/analytics'],
  env: {
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001'
  },
  async rewrites() {
    return [
      {
        source: '/api/analytics/:path*',
        destination: 'http://localhost:3000/api/analytics/:path*'
      }
    ];
  }
};

module.exports = nextConfig;