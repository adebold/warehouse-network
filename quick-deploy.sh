#\!/bin/bash
set -e

echo "🚀 Quick Deploy to New Project (Without Organization Restrictions)"
echo ""

# Configuration
PROJECT_ID="warehouse-${USER}-$(date +%Y%m%d%H%M)"
BILLING_ACCOUNT="015EA3-6F29B2-70DC78"  # Your first billing account
SERVICE_NAME="warehouse-app"
REGION="us-central1"

echo "📋 Creating project: $PROJECT_ID"

# Create and configure project
gcloud projects create $PROJECT_ID --name="Warehouse Network" --quiet || true
gcloud config set project $PROJECT_ID
gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT

echo "🔧 Enabling APIs..."
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com

echo "🚀 Deploying from source..."
cd apps/web

# Generate secrets
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Deploy with source upload
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 600 \
  --port 3000 \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_SECRET=$NEXTAUTH_SECRET"

# Get URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")

echo ""
echo "✅ DEPLOYED SUCCESSFULLY\!"
echo "🌐 Public URL (no auth needed): $SERVICE_URL"
echo ""
echo "🔐 NextAuth Secret: $NEXTAUTH_SECRET"
echo ""
echo "Share this URL with anyone - no authentication required\!"
EOF < /dev/null