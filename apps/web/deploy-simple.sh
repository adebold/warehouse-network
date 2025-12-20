#!/bin/bash
set -e

echo "🚀 Deploying Warehouse Network to Cloud Run (Simple Method)"
echo ""

PROJECT_ID="warehouse-adebold-202512191452"
SERVICE_NAME="warehouse-app"
REGION="us-central1"

# Generate a secure NextAuth secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)

echo "📦 Deploying directly from source..."
echo ""

# Deploy from source - Cloud Run will build it
gcloud run deploy ${SERVICE_NAME} \
  --source . \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --platform managed \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --port 3000 \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_URL=https://${SERVICE_NAME}-736504501114.us-central1.run.app,NEXTAUTH_SECRET=${NEXTAUTH_SECRET}"

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(status.url)")

echo ""
echo "✅ Deployment complete!"
echo "🌐 Service URL: ${SERVICE_URL}"
echo ""
echo "⚠️  Important: Save this NextAuth secret for future deployments:"
echo "NEXTAUTH_SECRET=${NEXTAUTH_SECRET}"
echo ""
echo "📝 Next steps:"
echo "1. Set up Cloud SQL and update DATABASE_URL"
echo "2. Configure Redis for session storage"
echo "3. Set up a custom domain (optional)"