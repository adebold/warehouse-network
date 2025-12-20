#!/bin/bash

# Deploy Warehouse Network to Cloud Run
echo "🚀 Deploying Warehouse Network to Cloud Run..."

PROJECT_ID="easyreno-demo-20251219144606"
REGION="us-central1"
SERVICE_NAME="warehouse-network"

# First create a simple working deployment
cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web

# Deploy using buildpacks (simpler than Docker)
echo "📦 Deploying with Cloud Run buildpacks..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --port 3000 \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_URL=https://warehouse-network-1078962111758.us-central1.run.app" \
  --project $PROJECT_ID

echo "✅ Deployment initiated!"
echo "📍 Service will be available at: https://warehouse-network-1078962111758.us-central1.run.app"