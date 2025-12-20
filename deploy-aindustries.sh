#!/bin/bash

# Deploy script for AI Industries Warehouse

echo "🚀 Deploying Warehouse Network to AI Industries..."

# Set project
gcloud config set project aindustries-warehouse

# Deploy to Cloud Run
cd apps/web
gcloud run deploy warehouse-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --project aindustries-warehouse

echo "✅ Deployment complete!"
echo "🌐 Your app will be available at the URL shown above"