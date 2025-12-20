#!/bin/bash
set -e

echo "🚀 Direct deployment to Cloud Run"
echo ""

# Configuration
PROJECT_ID="easyreno-poc-202512161545"
SERVICE_NAME="warehouse-app"
REGION="us-central1"

# Generate secrets
NEXTAUTH_SECRET=$(openssl rand -base64 32)

echo "📦 Deploying directly from source code..."
echo "This may take 5-10 minutes..."
echo ""

# Deploy directly from source
gcloud run deploy ${SERVICE_NAME} \
  --source . \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 2 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8080 \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_URL=https://${SERVICE_NAME}-736504501114.${REGION}.run.app,NEXTAUTH_SECRET=${NEXTAUTH_SECRET},DATABASE_URL=postgresql://postgres:postgres@/warehouse_network?host=/cloudsql/easyreno-poc-202512161545:us-central1:warehouse-db"

# Get service URL
if [ $? -eq 0 ]; then
    SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
      --region=${REGION} \
      --project=${PROJECT_ID} \
      --format="value(status.url)")

    echo ""
    echo "✅ Deployment successful!"
    echo "🌐 Service URL: ${SERVICE_URL}"
    echo ""
    echo "⚠️  Save these credentials:"
    echo "NEXTAUTH_SECRET=${NEXTAUTH_SECRET}"
    echo ""
    echo "📝 To check logs:"
    echo "gcloud run services logs read ${SERVICE_NAME} --region=${REGION} --project=${PROJECT_ID}"
else
    echo ""
    echo "❌ Deployment failed. Check the logs above for details."
fi