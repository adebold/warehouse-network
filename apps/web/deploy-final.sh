#!/bin/bash
set -e

echo "🚀 Final deployment attempt to Cloud Run"
echo ""

PROJECT_ID="easyreno-poc-202512161545"
SERVICE_NAME="warehouse-final"
REGION="us-central1"

# Generate NextAuth secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)

echo "📦 Deploying directly from source..."
echo ""

# Simple deployment from source
gcloud run deploy ${SERVICE_NAME} \
  --source . \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --port 3000 \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_SECRET=${NEXTAUTH_SECRET}"

if [ $? -eq 0 ]; then
    SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
      --region=${REGION} \
      --project=${PROJECT_ID} \
      --format="value(status.url)")

    echo ""
    echo "✅ SUCCESS! Your app is deployed!"
    echo "🌐 URL: ${SERVICE_URL}"
    echo ""
    echo "🔑 Save this secret:"
    echo "NEXTAUTH_SECRET=${NEXTAUTH_SECRET}"
    echo ""
    echo "📊 To view logs:"
    echo "gcloud run services logs read ${SERVICE_NAME} --region=${REGION}"
    echo ""
    echo "🔧 To update environment variables:"
    echo "gcloud run services update ${SERVICE_NAME} --region=${REGION} --update-env-vars KEY=VALUE"
fi