#!/bin/bash
set -euo pipefail

echo "🚀 Direct Cloud Run Deployment (Using Cloud Build)"
echo "=================================================="

# Configuration
PROJECT_ID="easyreno-demo-20251219144606"
REGION="us-central1"
SERVICE_NAME="warehouse-network"

cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web

echo "📋 Deployment Configuration:"
echo "   Project: ${PROJECT_ID}"
echo "   Service: ${SERVICE_NAME}"
echo "   Region: ${REGION}"
echo ""

# Ensure we have the right Dockerfile
echo "📝 Setting up deployment files..."

# Use the existing production Dockerfile
if [ -f "Dockerfile.production" ]; then
    cp Dockerfile.production Dockerfile
    echo "✅ Using production Dockerfile"
else
    # Create a simple working Dockerfile
    cat > Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app

# Copy and install dependencies
COPY package*.json ./
RUN npm install

# Copy application
COPY . .

# Build the app
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production environment
ENV NODE_ENV production
ENV PORT 8080

EXPOSE 8080
CMD ["npm", "start"]
EOF
    echo "✅ Created deployment Dockerfile"
fi

# Generate NextAuth secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)

echo "🚀 Deploying to Cloud Run..."
echo "This will take 5-10 minutes..."

# Deploy using Cloud Build
gcloud run deploy ${SERVICE_NAME} \
    --source . \
    --region ${REGION} \
    --project ${PROJECT_ID} \
    --platform managed \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --timeout 600 \
    --max-instances 50 \
    --set-env-vars "NODE_ENV=production" \
    --set-env-vars "NEXTAUTH_URL=https://${SERVICE_NAME}-1078962111758.${REGION}.run.app" \
    --set-env-vars "NEXTAUTH_SECRET=${NEXTAUTH_SECRET}" \
    --set-env-vars "DATABASE_URL=postgresql://postgres:password@/warehouse?host=/cloudsql/CONNECTION_NAME"

if [ $? -eq 0 ]; then
    # Get service URL
    SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
        --region=${REGION} \
        --project=${PROJECT_ID} \
        --format="value(status.url)")
    
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "🎉 Warehouse Network Application is LIVE!"
    echo "========================================="
    echo "🌐 Application URL: ${SERVICE_URL}"
    echo "🔐 NextAuth Secret: ${NEXTAUTH_SECRET}"
    echo ""
    echo "📋 Next Steps:"
    echo "1. Visit your application: ${SERVICE_URL}"
    echo "2. Set up a production database"
    echo "3. Configure custom domain (optional)"
    echo ""
    echo "🚀 Your enterprise application is now live on Google Cloud Run!"
else
    echo ""
    echo "❌ Deployment failed"
    echo "Check the build logs at:"
    echo "https://console.cloud.google.com/cloud-build/builds?project=${PROJECT_ID}"
fi