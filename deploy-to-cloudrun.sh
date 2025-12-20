#!/bin/bash
set -e

echo "🚀 Deploying Warehouse Network to Cloud Run"
echo ""

PROJECT_ID="easyreno-poc-202512161545"
SERVICE_NAME="warehouse-network-web"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "📦 Building container image with Cloud Build..."
echo ""

# Move to the app directory
cd apps/web

# Create a temporary .gcloudignore to exclude unnecessary files
cat > .gcloudignore << 'EOF'
node_modules/
.next/
*.log
.env*
coverage/
tests/
*.test.js
*.spec.js
.git/
EOF

# Use gcloud builds submit to build in the cloud with simple Dockerfile
gcloud builds submit \
  --tag ${IMAGE_NAME}:latest \
  --project ${PROJECT_ID} \
  --timeout=30m \
  --config=- . << 'EOF'
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', '${IMAGE_NAME}:latest', '-f', 'Dockerfile.simple', '.']
images: ['${IMAGE_NAME}:latest']
timeout: 1800s
EOF

cd ../..

echo ""
echo "🚀 Deploying to Cloud Run..."
echo ""

# Deploy the built image to Cloud Run
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --port 8080 \
  --set-env-vars "NODE_ENV=production" \
  --project ${PROJECT_ID}

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(status.url)")

echo ""
echo "✅ Deployment complete!"
echo "🌐 Service URL: ${SERVICE_URL}"
echo "🔍 Health check: ${SERVICE_URL}/api/health"
echo ""
echo "📝 Next steps:"
echo "1. Set up Cloud SQL database"
echo "2. Configure environment variables with database connection"
echo "3. Set up custom domain (optional)"
echo ""
echo "To update environment variables:"
echo "gcloud run services update ${SERVICE_NAME} --region=${REGION} --set-env-vars KEY=VALUE"