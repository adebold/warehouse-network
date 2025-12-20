#!/bin/bash

echo "🚀 Quick GCP Deployment for Warehouse Network"

# Set variables
PROJECT_ID="warehouse-adebold-202512191452"
SERVICE_NAME="warehouse-app"
REGION="us-central1"

# Ensure we're in the right directory
cd "$(dirname "$0")"

echo "📦 Step 1: Preparing for deployment..."

# Create a minimal package.json if needed
if [ ! -f "package-lock.json" ]; then
    echo "⚠️  No package-lock.json found, creating one..."
    npm install --package-lock-only
fi

echo "🏗️ Step 2: Deploying to Cloud Run..."

# Deploy using Cloud Build
gcloud run deploy $SERVICE_NAME \
    --source . \
    --region $REGION \
    --project $PROJECT_ID \
    --platform managed \
    --allow-unauthenticated \
    --memory 2Gi \
    --timeout 15m \
    --set-env-vars "NODE_ENV=production,PORT=8080"

echo "✅ Deployment initiated!"
echo "📊 Monitor build progress at: https://console.cloud.google.com/cloud-build/builds?project=$PROJECT_ID"