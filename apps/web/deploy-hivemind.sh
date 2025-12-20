#!/bin/bash

# HiveMind Deployment Script for AI Industries Warehouse
# Deploys from Cloud Shell to avoid Mac ARM64 issues

set -e

echo "🚀 HiveMind Deployment Starting..."
echo "================================="

# Configuration
PROJECT_ID="aindustries-warehouse"
SERVICE_NAME="warehouse-frontend"
REGION="us-central1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running in Cloud Shell
if [ -z "$CLOUD_SHELL" ]; then
    echo -e "${YELLOW}⚠️  Warning: Not running in Cloud Shell. This may cause architecture issues.${NC}"
    echo "Recommended: Run this from Google Cloud Shell for best results."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Set project
echo "📋 Setting project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Verify we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Not in the apps/web directory${NC}"
    echo "Please run this script from the apps/web directory"
    exit 1
fi

# Option selection
echo ""
echo "Select deployment option:"
echo "1) Quick Deploy (using source, recommended for first deployment)"
echo "2) Build with Docker (using optimized Dockerfile)"
echo "3) Deploy existing image (if build already succeeded)"
read -p "Enter option (1-3): " option

case $option in
    1)
        echo ""
        echo "🚀 Quick Deploy using Cloud Build source..."
        echo "This will build and deploy directly from source"
        
        # Deploy using source
        gcloud run deploy ${SERVICE_NAME} \
            --source . \
            --region ${REGION} \
            --allow-unauthenticated \
            --memory 2Gi \
            --cpu 2 \
            --timeout 300 \
            --port 8080 \
            --set-env-vars="NODE_ENV=production,NEXT_TELEMETRY_DISABLED=1"
        ;;
        
    2)
        echo ""
        echo "🐳 Building with optimized Docker configuration..."
        
        # Check if cloudbuild-optimized.yaml exists
        if [ ! -f "cloudbuild-optimized.yaml" ]; then
            echo -e "${YELLOW}⚠️  cloudbuild-optimized.yaml not found, using standard build${NC}"
            BUILD_CONFIG="cloudbuild.yaml"
        else
            BUILD_CONFIG="cloudbuild-optimized.yaml"
        fi
        
        # Submit build
        gcloud builds submit \
            --config ${BUILD_CONFIG} \
            --substitutions=COMMIT_SHA=$(git rev-parse HEAD || echo "manual-deploy")
        ;;
        
    3)
        echo ""
        echo "🎯 Deploying existing image..."
        
        # List recent images
        echo "Recent images:"
        gcloud container images list-tags gcr.io/${PROJECT_ID}/warehouse-frontend --limit=5
        
        read -p "Enter image tag (or 'latest'): " tag
        
        gcloud run deploy ${SERVICE_NAME} \
            --image gcr.io/${PROJECT_ID}/warehouse-frontend:${tag} \
            --region ${REGION} \
            --platform managed \
            --allow-unauthenticated \
            --memory 2Gi \
            --cpu 2
        ;;
        
    *)
        echo -e "${RED}❌ Invalid option${NC}"
        exit 1
        ;;
esac

# Get service URL
echo ""
echo "🔍 Getting service information..."
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
    --region=${REGION} \
    --format='value(status.url)')

if [ -z "$SERVICE_URL" ]; then
    echo -e "${RED}❌ Failed to get service URL${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Deployment successful!${NC}"
echo ""
echo "🌐 Service URL: ${SERVICE_URL}"
echo ""

# Warm up the service
echo "🔥 Warming up service..."
for i in {1..3}; do
    echo -n "  Attempt $i: "
    if curl -s -o /dev/null -w "%{http_code}" "${SERVICE_URL}/api/health" | grep -q "200"; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${YELLOW}⚠️${NC}"
    fi
    sleep 2
done

echo ""
echo "📊 Deployment Summary:"
echo "====================="
echo "Project: ${PROJECT_ID}"
echo "Service: ${SERVICE_NAME}"
echo "Region: ${REGION}"
echo "URL: ${SERVICE_URL}"
echo ""
echo "🎯 Next Steps:"
echo "1. Visit ${SERVICE_URL} to see your application"
echo "2. Set up custom domain at https://console.cloud.google.com/run"
echo "3. Configure monitoring at https://console.cloud.google.com/monitoring"
echo ""
echo "✨ HiveMind Deployment Complete!"