#!/bin/bash
set -euo pipefail

echo "🚀 Deploying Warehouse Network Application"
echo "=========================================="

# Configuration
PROJECT_ID="easyreno-demo-20251219144606"
REGION="us-central1"
SERVICE_NAME="warehouse-network"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
VERSION=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")

cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web

echo "📋 Deployment Configuration:"
echo "   Project: ${PROJECT_ID}"
echo "   Service: ${SERVICE_NAME}"
echo "   Region: ${REGION}"
echo "   Version: ${VERSION}"
echo ""

# Step 1: Create optimized Dockerfile
echo "📝 Creating optimized Dockerfile..."
cat > Dockerfile.optimized << 'EOF'
# Optimized Dockerfile for Warehouse Network
FROM node:18-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# Build the Next.js app
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 8080
ENV PORT 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

CMD ["node", "server.js"]
EOF

# Step 2: Configure Docker authentication
echo "🔧 Configuring Docker authentication..."
gcloud auth configure-docker --quiet

# Step 3: Build the image
echo "🏗️ Building Docker image..."
DOCKER_BUILDKIT=1 docker build \
  -f Dockerfile.optimized \
  -t "${IMAGE}:${VERSION}" \
  -t "${IMAGE}:latest" \
  --progress=plain \
  .

if [ $? -ne 0 ]; then
  echo "❌ Docker build failed"
  exit 1
fi

echo "✅ Docker image built successfully"

# Step 4: Push to GCR
echo "📤 Pushing image to Container Registry..."
docker push "${IMAGE}:${VERSION}"
docker push "${IMAGE}:latest"

if [ $? -ne 0 ]; then
  echo "❌ Failed to push image"
  exit 1
fi

echo "✅ Image pushed successfully"

# Step 5: Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."

# Generate secure NextAuth secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)

gcloud run deploy ${SERVICE_NAME} \
  --image "${IMAGE}:${VERSION}" \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --min-instances 0 \
  --max-instances 50 \
  --timeout 300 \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "NEXTAUTH_URL=https://${SERVICE_NAME}-${REGION}.run.app" \
  --set-env-vars "NEXTAUTH_SECRET=${NEXTAUTH_SECRET}" \
  --set-env-vars "DATABASE_URL=postgresql://user:password@localhost:5432/warehouse" \
  --port 8080

if [ $? -ne 0 ]; then
  echo "❌ Deployment failed"
  exit 1
fi

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --format="value(status.url)")

echo ""
echo "✅ Deployment successful!"
echo ""
echo "🎉 Your Warehouse Network application is LIVE!"
echo "=============================================="
echo "🌐 Application URL: ${SERVICE_URL}"
echo "🔐 NextAuth Secret: ${NEXTAUTH_SECRET}"
echo "📊 Version: ${VERSION}"
echo ""
echo "📋 Next Steps:"
echo "1. Update DATABASE_URL with your production database"
echo "2. Configure custom domain (optional)"
echo "3. Set up monitoring and alerts"
echo ""
echo "🚀 Your application is now live on Google Cloud Run!"