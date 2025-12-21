/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@warehouse/types', '@warehouse/auth', '@warehouse/security', '@warehouse/ui', '@warehouse/config'],
  
  // Skip static generation for deployment
  output: 'standalone',
  
  // Disable static optimization for problematic pages
  experimental: {
    appDir: false,
  },
  
  // Skip type checking and linting in production builds
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig