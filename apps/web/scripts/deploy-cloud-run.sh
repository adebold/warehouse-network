#!/bin/bash

# Cloud Run Deployment Script
# This script helps deploy the Next.js app to Cloud Run

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="easyreno-poc-202512161545"
SERVICE_NAME="warehouse-network-web"
REGION="us-central1"
IMAGE_NAME="warehouse-network-web"

echo -e "${GREEN}🚀 Cloud Run Deployment Script${NC}"
echo "================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Check current project
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
    echo -e "${YELLOW}⚠️  Current project is '$CURRENT_PROJECT', switching to '$PROJECT_ID'${NC}"
    gcloud config set project $PROJECT_ID
fi

# Function to deploy using Cloud Build
deploy_cloud_build() {
    echo -e "${GREEN}📦 Deploying using Cloud Build...${NC}"
    
    # Check if we're in the right directory
    if [ ! -f "cloudbuild-simple.yaml" ]; then
        echo -e "${RED}❌ cloudbuild-simple.yaml not found. Are you in the apps/web directory?${NC}"
        exit 1
    fi
    
    # Submit build
    echo -e "${GREEN}🏗️  Submitting build to Cloud Build...${NC}"
    gcloud builds submit \
        --config=cloudbuild-simple.yaml \
        --substitutions=_SERVICE_NAME=$SERVICE_NAME,_REGION=$REGION,_IMAGE_NAME=$IMAGE_NAME \
        --project=$PROJECT_ID
}

# Function to build and deploy locally
deploy_local() {
    echo -e "${GREEN}📦 Building and deploying locally...${NC}"
    
    # Build image with explicit platform
    echo -e "${GREEN}🏗️  Building Docker image...${NC}"
    docker build \
        --platform linux/amd64 \
        -t gcr.io/$PROJECT_ID/$IMAGE_NAME:latest \
        -f Dockerfile.cloudrun \
        .
    
    # Push to GCR
    echo -e "${GREEN}⬆️  Pushing image to Container Registry...${NC}"
    docker push gcr.io/$PROJECT_ID/$IMAGE_NAME:latest
    
    # Deploy to Cloud Run
    echo -e "${GREEN}🚀 Deploying to Cloud Run...${NC}"
    gcloud run deploy $SERVICE_NAME \
        --image gcr.io/$PROJECT_ID/$IMAGE_NAME:latest \
        --region $REGION \
        --platform managed \
        --allow-unauthenticated \
        --memory 1Gi \
        --cpu 1 \
        --min-instances 0 \
        --max-instances 100 \
        --port 3000 \
        --set-env-vars NODE_ENV=production \
        --project=$PROJECT_ID
}

# Function to verify deployment
verify_deployment() {
    echo -e "${GREEN}✅ Verifying deployment...${NC}"
    
    # Get service URL
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
        --region=$REGION \
        --format='value(status.url)' \
        --project=$PROJECT_ID)
    
    if [ -n "$SERVICE_URL" ]; then
        echo -e "${GREEN}✅ Service deployed successfully!${NC}"
        echo -e "${GREEN}🌐 Service URL: $SERVICE_URL${NC}"
        
        # Test the service
        echo -e "${YELLOW}📡 Testing service health...${NC}"
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" $SERVICE_URL)
        
        if [ "$HTTP_CODE" -eq 200 ]; then
            echo -e "${GREEN}✅ Service is healthy (HTTP $HTTP_CODE)${NC}"
        else
            echo -e "${YELLOW}⚠️  Service returned HTTP $HTTP_CODE${NC}"
        fi
    else
        echo -e "${RED}❌ Failed to get service URL${NC}"
        exit 1
    fi
}

# Function to check logs
check_logs() {
    echo -e "${YELLOW}📋 Recent logs:${NC}"
    gcloud run services logs read $SERVICE_NAME \
        --region=$REGION \
        --limit=20 \
        --project=$PROJECT_ID
}

# Main menu
echo "Select deployment method:"
echo "1) Cloud Build (Recommended)"
echo "2) Local Build & Deploy"
echo "3) Verify existing deployment"
echo "4) Check service logs"
echo "5) Exit"

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        deploy_cloud_build
        verify_deployment
        ;;
    2)
        deploy_local
        verify_deployment
        ;;
    3)
        verify_deployment
        ;;
    4)
        check_logs
        ;;
    5)
        echo -e "${GREEN}👋 Goodbye!${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}❌ Invalid choice${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}✨ Done!${NC}"