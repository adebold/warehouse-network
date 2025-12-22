#!/bin/bash
# Setup script for Google Memorystore Redis instance
# This script creates a production Redis instance for the warehouse platform

PROJECT_ID="aindustries-warehouse"
INSTANCE_ID="warehouse-redis"
REGION="us-central1"
ZONE="us-central1-a"
REDIS_VERSION="redis_6_x"
MEMORY_SIZE_GB="1"
NETWORK="default"

echo "🗄️ Setting up Google Memorystore Redis instance..."

# Enable required APIs
echo "📡 Enabling Redis API..."
gcloud services enable redis.googleapis.com \
  --project=$PROJECT_ID

# Check if instance already exists
echo "🔍 Checking for existing Redis instance..."
if gcloud redis instances describe $INSTANCE_ID \
  --region=$REGION \
  --project=$PROJECT_ID &>/dev/null; then
  echo "✅ Redis instance already exists!"
  
  # Get instance details
  REDIS_HOST=$(gcloud redis instances describe $INSTANCE_ID \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format="value(host)")
  REDIS_PORT=$(gcloud redis instances describe $INSTANCE_ID \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format="value(port)")
else
  echo "📦 Creating Redis instance..."
  gcloud redis instances create $INSTANCE_ID \
    --size=$MEMORY_SIZE_GB \
    --region=$REGION \
    --zone=$ZONE \
    --redis-version=$REDIS_VERSION \
    --network=projects/$PROJECT_ID/global/networks/$NETWORK \
    --project=$PROJECT_ID
  
  # Wait for instance to be ready
  echo "⏳ Waiting for Redis instance to be ready (this may take 5-10 minutes)..."
  gcloud redis operations list \
    --region=$REGION \
    --project=$PROJECT_ID \
    --filter="name:$INSTANCE_ID" \
    --format="table(name,done)" \
    --watch
  
  # Get instance details
  REDIS_HOST=$(gcloud redis instances describe $INSTANCE_ID \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format="value(host)")
  REDIS_PORT=$(gcloud redis instances describe $INSTANCE_ID \
    --region=$REGION \
    --project=$PROJECT_ID \
    --format="value(port)")
fi

# Update Redis URL in Secret Manager
REDIS_URL="redis://$REDIS_HOST:$REDIS_PORT"
echo "🔒 Updating Redis URL in Secret Manager..."
echo -n "$REDIS_URL" | gcloud secrets versions add REDIS_URL \
  --data-file=- \
  --project=$PROJECT_ID

echo "✅ Redis setup complete!"
echo ""
echo "📋 Redis Instance Details:"
echo "  - Instance ID: $INSTANCE_ID"
echo "  - Region: $REGION"
echo "  - Host: $REDIS_HOST"
echo "  - Port: $REDIS_PORT"
echo "  - Redis URL: $REDIS_URL"
echo ""
echo "🔍 To view instance details:"
echo "gcloud redis instances describe $INSTANCE_ID --region=$REGION --project=$PROJECT_ID"
echo ""
echo "💡 Note: Redis instances in Memorystore:"
echo "  - Are fully managed and automatically backed up"
echo "  - Have built-in high availability"
echo "  - Are accessible only from within the VPC"
echo "  - Support Redis 6.x features"