#!/bin/bash

echo "🚀 Quick Vercel Deployment Script"
echo ""
echo "This will deploy your app to Vercel using the CLI."
echo ""

# Option 1: If you have a token
if [ -n "$VERCEL_TOKEN" ]; then
    echo "✅ Using VERCEL_TOKEN from environment"
    npx vercel --yes --token=$VERCEL_TOKEN
else
    echo "To deploy, you need to either:"
    echo ""
    echo "Option 1: Login interactively"
    echo "  Run: npx vercel login"
    echo "  Then: npx vercel --yes"
    echo ""
    echo "Option 2: Use a token"
    echo "  1. Get a token from: https://vercel.com/account/tokens"
    echo "  2. Run: VERCEL_TOKEN=your-token ./deploy-now.sh"
    echo ""
    echo "Option 3: Try non-interactive deployment"
    echo "  Running deployment with --confirm flag..."
    echo ""
    
    # Try to deploy with automatic confirmation
    npx vercel --yes --confirm \
        --name warehouse-network \
        --build-env NEXTAUTH_URL="https://warehouse-network.vercel.app" \
        --env NEXTAUTH_URL="https://warehouse-network.vercel.app" \
        2>&1 | tee deployment.log
    
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo ""
        echo "✅ Deployment successful!"
        echo "Check deployment.log for details"
    else
        echo ""
        echo "❌ Deployment failed. Please login first with: npx vercel login"
    fi
fi