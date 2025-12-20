#!/bin/bash
set -e

echo "🚀 Simple Cloud Run Deployment"
echo ""

PROJECT_ID="easyreno-poc-202512161545"
SERVICE_NAME="warehouse-network"
REGION="us-central1"

# Go to app directory
cd apps/web

# Copy simple dockerfile as main
cp Dockerfile.simple Dockerfile

echo "📦 Building and deploying directly to Cloud Run..."
echo "This will take a few minutes..."

# Deploy directly from source
gcloud run deploy ${SERVICE_NAME} \
  --source . \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --port 3000 \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_URL=https://${SERVICE_NAME}-${PROJECT_ID}.a.run.app,NEXTAUTH_SECRET=temp-secret-change-me"

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(status.url)" || echo "Service URL not available yet")

echo ""
echo "✅ Deployment complete!"
echo "🌐 Service URL: ${SERVICE_URL}"
echo ""
echo "📝 Important Notes:"
echo "1. The app is running but needs database configuration"
echo "2. Set up Cloud SQL and update DATABASE_URL"
echo "3. Update NEXTAUTH_SECRET with a secure value"
echo "4. Configure Redis for session storage"
echo ""
echo "To view logs:"
echo "gcloud run services logs read ${SERVICE_NAME} --region=${REGION}"