#!/bin/bash

# Optimized Cloud Run deployment script
set -e

echo "🚀 Starting optimized Cloud Run deployment..."

PROJECT_ID="warehouse-adebold-202512191452"
SERVICE_NAME="warehouse-app"
REGION="us-central1"

# Configure gcloud
gcloud config set project $PROJECT_ID

echo "📦 Building and deploying directly to Cloud Run..."

# Deploy with source (Cloud Build will handle everything)
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 60m \
  --max-instances 100 \
  --min-instances 0 \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "NEXTAUTH_URL=https://${SERVICE_NAME}-736504501114.${REGION}.run.app" \
  --set-env-vars "DATABASE_URL=postgresql://postgres:password@/warehouse_network?host=/cloudsql/CONNECTION_NAME" \
  --port 8080

echo "✅ Deployment complete!"
echo "🌐 Your app should be available at: https://${SERVICE_NAME}-736504501114.${REGION}.run.app"