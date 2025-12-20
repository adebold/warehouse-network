#!/bin/bash

echo "🔧 Fixing dependencies and deploying to Vercel..."

# Fix the node_modules issue
echo "Cleaning node_modules..."
rm -rf node_modules/.abab-*
rm -rf node_modules

# Add missing dependencies to package.json
echo "Adding missing dependencies..."
npm install date-fns bcryptjs --save --force

# Try to build
echo "Testing build..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo ""
    echo "🚀 Ready to deploy to Vercel!"
    echo ""
    echo "Run one of these commands:"
    echo "1. npx vercel login && npx vercel --yes"
    echo "2. Or visit: https://vercel.com/new"
else
    echo "Build still has errors. Fixing imports..."
    # Quick fix - replace bcryptjs with bcrypt since bcrypt is installed
    find . -name "*.ts" -o -name "*.tsx" | xargs sed -i '' "s/from 'bcryptjs'/from 'bcrypt'/g" 2>/dev/null || true
    
    echo "Retrying build..."
    npm run build
fi