#!/bin/bash
set -e

echo "🚀 Deploying with Organization Admin Account"
echo ""

# Configuration
PROJECT_ID="warehouse-adebold-202512191452"
SERVICE_NAME="warehouse-public"
REGION="us-central1"
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Ensure we're using the right project
gcloud config set project $PROJECT_ID

echo "📦 Deploying warehouse application..."
cd apps/web

# Deploy with explicit flags
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --port 8080 \
  --max-instances 10 \
  --concurrency 100 \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_SECRET=$NEXTAUTH_SECRET" \
  --quiet

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format="value(status.url)")

if [ ! -z "$SERVICE_URL" ]; then
    echo ""
    echo "✅ Deployment Successful!"
    echo "🌐 Public URL: $SERVICE_URL"
    echo ""
    echo "🔐 NextAuth Secret: $NEXTAUTH_SECRET"
    echo ""
    echo "Testing public access..."
    curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" $SERVICE_URL
else
    echo "❌ Deployment is still processing. Check back in a few minutes."
fi