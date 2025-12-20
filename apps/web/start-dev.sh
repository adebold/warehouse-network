#!/bin/bash

echo "🚀 Starting development server..."

# Set environment
export NODE_ENV=development

# Clean previous builds
rm -rf .next

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Start Next.js
echo "▲ Starting Next.js..."
exec npm run dev