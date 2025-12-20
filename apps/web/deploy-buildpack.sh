#!/bin/bash
set -e

echo "🚀 Deploying with Google Cloud Buildpacks"
echo ""

PROJECT_ID="easyreno-poc-202512161545"
SERVICE_NAME="warehouse-web-app"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Clean up
rm -rf .next node_modules

echo "📦 Building with buildpacks..."
echo ""

# Use pack to build with Google buildpacks
gcloud run deploy ${SERVICE_NAME} \
  --source . \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --platform managed \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --allow-unauthenticated \
  --port 8080 \
  --max-instances 5 \
  --set-env-vars "NODE_ENV=production,SKIP_BUILD_STATIC_GENERATION=true"

if [ $? -eq 0 ]; then
    SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
      --region=${REGION} \
      --project=${PROJECT_ID} \
      --format="value(status.url)")

    echo ""
    echo "✅ Deployment successful!"
    echo "🌐 Service URL: ${SERVICE_URL}"
    echo ""
    echo "📝 View logs with:"
    echo "gcloud run services logs read ${SERVICE_NAME} --region=${REGION}"
else
    echo "❌ Deployment failed"
fi