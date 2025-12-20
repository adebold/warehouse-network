#!/bin/bash

echo "🚀 Deploying to Vercel via CLI..."
echo ""

# Check if user is logged in
if ! npx vercel whoami >/dev/null 2>&1; then
    echo "❌ Not logged in to Vercel"
    echo ""
    echo "Please run: npx vercel login"
    echo "Then run this script again."
    exit 1
fi

echo "✅ Logged in to Vercel"
echo ""

# Deploy with automatic settings
echo "📦 Starting deployment..."
npx vercel --yes \
  --name warehouse-network \
  --scope personal \
  --build-env DATABASE_URL="postgresql://temp:temp@localhost/temp" \
  --build-env NEXTAUTH_URL="https://warehouse-network.vercel.app" \
  --build-env NEXTAUTH_SECRET="temp-build-secret" \
  --env DATABASE_URL="postgresql://temp:temp@localhost/temp" \
  --env NEXTAUTH_URL="https://warehouse-network.vercel.app" \
  --env NEXTAUTH_SECRET="temp-build-secret"

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "📝 Next steps:"
echo "1. Go to https://vercel.com/dashboard to see your deployment"
echo "2. Update environment variables with real values"
echo "3. Connect a database (Vercel Postgres recommended)"
echo ""