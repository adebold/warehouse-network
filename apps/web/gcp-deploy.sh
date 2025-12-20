#!/bin/bash

set -e

echo "🚀 Google Cloud Run Deployment"
echo "=============================="

# Variables
PROJECT_ID="warehouse-adebold-202512191452"
SERVICE_NAME="warehouse-app"
REGION="us-central1"
IMAGE="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "📋 Configuration:"
echo "  Project: $PROJECT_ID"
echo "  Service: $SERVICE_NAME"
echo "  Region: $REGION"
echo ""

# Step 1: Build locally
echo "🏗️  Building Docker image locally..."
docker build -f Dockerfile.cloudrun-simple -t $IMAGE .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed"
    exit 1
fi

echo "✅ Docker build successful"

# Step 2: Push to GCR
echo "📤 Pushing image to Google Container Registry..."
docker push $IMAGE

if [ $? -ne 0 ]; then
    echo "❌ Failed to push image"
    echo "Run: gcloud auth configure-docker"
    exit 1
fi

echo "✅ Image pushed successfully"

# Step 3: Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --max-instances 10 \
    --set-env-vars "NODE_ENV=production,NEXTAUTH_URL=https://$SERVICE_NAME-$REGION.run.app"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your app is available at:"
gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)'
echo ""
echo "📝 Next steps:"
echo "1. Add environment variables in Cloud Console"
echo "2. Set up Cloud SQL database"
echo "3. Update NEXTAUTH_URL with actual URL"