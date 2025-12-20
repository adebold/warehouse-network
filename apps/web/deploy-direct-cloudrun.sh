#!/bin/bash

echo "🚀 Direct Cloud Run Deployment (Using Cloud Build)"
echo ""

PROJECT_ID="warehouse-adebold-202512191452"
SERVICE_NAME="warehouse-app"
REGION="us-central1"

# Deploy directly from source - let Cloud Build handle everything
echo "📦 Deploying from source code..."
echo "This will take 5-10 minutes..."
echo ""

gcloud run deploy $SERVICE_NAME \
    --source . \
    --region $REGION \
    --project $PROJECT_ID \
    --platform managed \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --timeout 600 \
    --set-env-vars "NODE_ENV=production"

echo ""
echo "✅ Deployment initiated!"
echo ""
echo "Monitor progress at:"
echo "https://console.cloud.google.com/cloud-build/builds?project=$PROJECT_ID"