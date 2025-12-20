#!/bin/bash
set -euo pipefail

# HiveMind Cloud Run Deployment Script
# Production-ready configuration for warehouse-frontend

echo "🚀 HiveMind Deployment System - Starting deployment..."

# Configuration
PROJECT_ID="aindustries-warehouse"
SERVICE_NAME="warehouse-frontend"
REGION="us-central1"
PLATFORM="managed"

# Build Configuration
BUILD_TIMEOUT="20m"  # Extended timeout for production builds
MACHINE_TYPE="e2-highcpu-8"  # High CPU for faster builds

# Cloud Run Configuration
MIN_INSTANCES=1  # Always keep 1 instance warm
MAX_INSTANCES=100  # Scale up to 100 instances
CONCURRENCY=1000  # Max concurrent requests per instance
CPU_THROTTLING="false"  # Always allocate CPU
MEMORY="2Gi"  # 2GB memory per instance
CPU="2"  # 2 vCPUs per instance
TIMEOUT="300"  # 5 minute request timeout

# Environment variables (will be set from Secret Manager in production)
ENV_VARS=(
    "NODE_ENV=production"
    "NEXT_TELEMETRY_DISABLED=1"
    "PORT=3000"
)

# Check if gcloud is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &>/dev/null; then
    echo "❌ Not authenticated with gcloud. Please run: gcloud auth login"
    exit 1
fi

# Set project
echo "📋 Setting GCP project to: $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Check if Cloud Build API is enabled
echo "🔍 Checking Cloud Build API..."
if ! gcloud services list --enabled --filter="name:cloudbuild.googleapis.com" --format="value(name)" | grep -q "cloudbuild"; then
    echo "⚙️  Enabling Cloud Build API..."
    gcloud services enable cloudbuild.googleapis.com
    sleep 10  # Wait for API to be fully enabled
fi

# Check if Cloud Run API is enabled
echo "🔍 Checking Cloud Run API..."
if ! gcloud services list --enabled --filter="name:run.googleapis.com" --format="value(name)" | grep -q "run"; then
    echo "⚙️  Enabling Cloud Run API..."
    gcloud services enable run.googleapis.com
    sleep 10  # Wait for API to be fully enabled
fi

# Submit build to Cloud Build
echo "🏗️  Submitting build to Cloud Build..."
echo "   Build timeout: $BUILD_TIMEOUT"
echo "   Machine type: $MACHINE_TYPE"

gcloud builds submit \
    --config=cloudbuild.hivemind.yaml \
    --timeout=$BUILD_TIMEOUT \
    --machine-type=$MACHINE_TYPE \
    --substitutions=_SERVICE_NAME=$SERVICE_NAME,_REGION=$REGION \
    --async

# Get the latest build ID
BUILD_ID=$(gcloud builds list --limit=1 --format="value(id)")
echo "   Build ID: $BUILD_ID"

# Stream build logs
echo "📝 Streaming build logs..."
gcloud builds log $BUILD_ID --stream

# Check build status
BUILD_STATUS=$(gcloud builds describe $BUILD_ID --format="value(status)")
if [ "$BUILD_STATUS" != "SUCCESS" ]; then
    echo "❌ Build failed with status: $BUILD_STATUS"
    exit 1
fi

echo "✅ Build completed successfully!"

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
echo "   Service: $SERVICE_NAME"
echo "   Region: $REGION"
echo "   Min instances: $MIN_INSTANCES"
echo "   Max instances: $MAX_INSTANCES"
echo "   Memory: $MEMORY"
echo "   CPU: $CPU"

# Build environment variables string
ENV_VAR_FLAGS=""
for env_var in "${ENV_VARS[@]}"; do
    ENV_VAR_FLAGS="$ENV_VAR_FLAGS --set-env-vars=$env_var"
done

# Deploy the service
gcloud run deploy $SERVICE_NAME \
    --image=gcr.io/$PROJECT_ID/$SERVICE_NAME:latest \
    --platform=$PLATFORM \
    --region=$REGION \
    --min-instances=$MIN_INSTANCES \
    --max-instances=$MAX_INSTANCES \
    --concurrency=$CONCURRENCY \
    --cpu-throttling=$CPU_THROTTLING \
    --memory=$MEMORY \
    --cpu=$CPU \
    --timeout=$TIMEOUT \
    --port=3000 \
    --allow-unauthenticated \
    $ENV_VAR_FLAGS

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --platform=$PLATFORM \
    --region=$REGION \
    --format="value(status.url)")

echo "✅ Deployment completed successfully!"
echo "🌐 Service URL: $SERVICE_URL"

# Configure health check
echo "🏥 Configuring health check..."
gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --update-annotations=run.googleapis.com/startup-probe-initial-delay-seconds=10,run.googleapis.com/startup-probe-timeout-seconds=10,run.googleapis.com/startup-probe-period-seconds=10,run.googleapis.com/startup-probe-failure-threshold=3

# Test the deployment
echo "🧪 Testing deployment health..."
HEALTH_CHECK_URL="$SERVICE_URL/api/health"
echo "   Checking: $HEALTH_CHECK_URL"

# Wait for service to be ready
sleep 10

# Check health endpoint
if curl -f -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL" | grep -q "200"; then
    echo "✅ Health check passed!"
else
    echo "⚠️  Health check failed or service is still starting up"
    echo "   You can manually check: $HEALTH_CHECK_URL"
fi

# Performance recommendations
echo ""
echo "🎯 Performance Optimization Tips:"
echo "   1. Enable Cloud CDN for static assets"
echo "   2. Set up Cloud Load Balancing for multi-region"
echo "   3. Configure Cloud Armor for DDoS protection"
echo "   4. Use Secret Manager for sensitive environment variables"
echo "   5. Set up Cloud Monitoring alerts"
echo ""

# Display deployment summary
echo "📊 Deployment Summary:"
echo "   Project: $PROJECT_ID"
echo "   Service: $SERVICE_NAME"
echo "   Region: $REGION"
echo "   URL: $SERVICE_URL"
echo "   Min/Max Instances: $MIN_INSTANCES/$MAX_INSTANCES"
echo "   Resources: $CPU vCPU, $MEMORY memory"
echo ""
echo "🚀 HiveMind deployment complete!"