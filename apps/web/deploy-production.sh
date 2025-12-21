#!/bin/bash
set -e

echo "🚀 Deploying Warehouse Application to Cloud Run"

PROJECT_ID="warehouse-network-20251220"
SERVICE_NAME="warehouse-frontend"
REGION="us-central1"
IMAGE_URL="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest"

# Build the production Docker image
echo "📦 Building production Docker image..."
docker build -f Dockerfile.production-fixed -t ${IMAGE_URL} .

# Push to Google Container Registry
echo "🔄 Pushing image to GCR..."
docker push ${IMAGE_URL}

# Deploy to Cloud Run with environment variables
echo "🌐 Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_URL} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --port 3000 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --max-instances 100 \
  --min-instances 1 \
  --set-env-vars "NODE_ENV=production,NEXT_TELEMETRY_DISABLED=1" \
  --set-secrets "NEXTAUTH_SECRET=nextauth-secret:latest" \
  --project ${PROJECT_ID}

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --platform managed \
  --region ${REGION} \
  --format 'value(status.url)' \
  --project ${PROJECT_ID})

echo "✅ Deployment complete!"
echo "🌐 Service URL: ${SERVICE_URL}"
echo "📊 Testing health endpoint..."
curl -s "${SERVICE_URL}/api/health" || echo "Health check endpoint not yet available"