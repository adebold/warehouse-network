#!/bin/bash
set -e

echo "🚀 Deploying Warehouse Network to Cloud Run"
echo ""

# Configuration
PROJECT_ID="easyreno-poc-202512161545"
SERVICE_NAME="warehouse-app"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Generate secrets
NEXTAUTH_SECRET=$(openssl rand -base64 32)

echo "📦 Building Docker image with Cloud Build..."
echo ""

# Create a .gcloudignore file
cat > .gcloudignore << 'EOF'
node_modules/
.next/
.env*
coverage/
tests/
*.test.js
*.spec.js
.git/
test-deploy/
EOF

# Use Cloud Build to build the image
gcloud builds submit \
  --config=cloudbuild-deploy.yaml \
  --project ${PROJECT_ID} \
  --timeout=30m

echo ""
echo "🚀 Deploying to Cloud Run..."
echo ""

# Deploy to Cloud Run
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 2 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8080 \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_URL=https://${SERVICE_NAME}-${PROJECT_ID//-/}.${REGION}.run.app,NEXTAUTH_SECRET=${NEXTAUTH_SECRET}" \
  --project ${PROJECT_ID}

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(status.url)")

echo ""
echo "✅ Deployment complete!"
echo "🌐 Service URL: ${SERVICE_URL}"
echo ""
echo "⚠️  Save these credentials:"
echo "NEXTAUTH_SECRET=${NEXTAUTH_SECRET}"
echo ""
echo "📝 Next steps:"
echo "1. Set up Cloud SQL:"
echo "   gcloud sql instances create warehouse-db --tier=db-f1-micro --region=${REGION}"
echo ""
echo "2. Update environment variables:"
echo "   gcloud run services update ${SERVICE_NAME} --region=${REGION} \\"
echo "     --update-env-vars DATABASE_URL=<your-database-url>"
echo ""
echo "3. View logs:"
echo "   gcloud run services logs read ${SERVICE_NAME} --region=${REGION}"