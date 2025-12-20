#!/bin/bash

echo "🚀 Deploying to Vercel..."
echo ""
echo "Since we need authentication, you have two options:"
echo ""
echo "Option 1: Interactive login (recommended)"
echo "Run: npx vercel login"
echo "Then: npx vercel --yes"
echo ""
echo "Option 2: Use a token"
echo "1. Go to: https://vercel.com/account/tokens"
echo "2. Create a token"
echo "3. Run: VERCEL_TOKEN=your-token npx vercel --yes --token=your-token"
echo ""
echo "For now, let's try the build locally to ensure it works:"
echo ""

# Test the build
echo "📦 Testing build locally..."
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful! Your app is ready for Vercel."
    echo ""
    echo "To deploy, run one of these commands:"
    echo "1. npx vercel login && npx vercel --yes"
    echo "2. VERCEL_TOKEN=your-token npx vercel --yes --token=your-token"
else
    echo ""
    echo "❌ Build failed. Please fix the errors before deploying."
fi