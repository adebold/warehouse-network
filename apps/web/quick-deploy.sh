#!/bin/bash
set -e

echo "🚀 Quick Deploy to Cloud Run"
echo ""

PROJECT_ID="easyreno-poc-202512161545"
SERVICE_NAME="warehouse-web"
REGION="us-central1"

# Use a pre-built Node.js image and deploy
echo "Creating app.yaml for deployment..."

cat > app.yaml << 'EOF'
runtime: nodejs18
service: default

env_variables:
  NODE_ENV: "production"
  PORT: "8080"

automatic_scaling:
  min_instances: 0
  max_instances: 10
EOF

echo "📦 Using gcloud run deploy with source..."

# Deploy from source with explicit buildpack
gcloud run deploy ${SERVICE_NAME} \
  --source . \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --platform managed \
  --memory 1Gi \
  --timeout 300 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars NODE_ENV=production

echo "✅ Done!"