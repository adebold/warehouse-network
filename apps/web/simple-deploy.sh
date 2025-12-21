#!/bin/bash
set -e

echo "🚀 Simple deployment to Cloud Run"

# Deploy directly from source
gcloud run deploy warehouse-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --project aindustries-warehouse \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_SECRET=$(openssl rand -base64 32)"

echo "✅ Deployment complete!"