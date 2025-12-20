#!/bin/bash

echo "🚀 Minimal deployment to Cloud Run..."

# First let's test if the build works locally
echo "Testing Docker build locally..."
docker build -f Dockerfile.minimal -t test-build . || {
    echo "❌ Local build failed. Let's check what's wrong..."
    exit 1
}

echo "✅ Local build successful! Now deploying to Cloud Run..."

# Deploy with the minimal Dockerfile
gcloud run deploy warehouse-app \
    --source . \
    --region us-central1 \
    --allow-unauthenticated \
    --platform managed \
    --memory 2Gi \
    --timeout 15m

echo "✅ Deployment complete!"