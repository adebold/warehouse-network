/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Skip static generation for deployment
  output: 'standalone',
  
  // Skip type checking and linting in production builds
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig