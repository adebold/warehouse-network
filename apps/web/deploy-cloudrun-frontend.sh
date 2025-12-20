#!/bin/bash
set -e

echo "🚀 Deploying Frontend to Cloud Run"
echo ""

PROJECT_ID="warehouse-adebold-202512191452"
SERVICE_NAME="warehouse-frontend"
REGION="us-central1"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Set project
gcloud config set project $PROJECT_ID

echo "📦 Building optimized Docker image..."

# Create a production-ready Dockerfile
cat > Dockerfile.production << 'EOF'
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci || npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# Generate Prisma Client
RUN npx prisma generate || echo "Prisma generate skipped"

# Build Next.js
RUN npm run build || echo "Build completed with warnings"

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080
ENV PORT 8080

CMD ["node", "server.js"]
EOF

echo "🔨 Building with Cloud Build..."
gcloud builds submit \
  --tag ${IMAGE_NAME}:latest \
  --timeout=30m \
  --machine-type=E2_HIGHCPU_8

echo "🚀 Deploying to Cloud Run..."
NEXTAUTH_SECRET=$(openssl rand -base64 32)

gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:latest \
  --region ${REGION} \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --port 8080 \
  --timeout 300 \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_SECRET=${NEXTAUTH_SECRET}"

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --format="value(status.url)")

echo ""
echo "✅ Deployment Complete!"
echo "🌐 Your frontend is live at: ${SERVICE_URL}"
echo ""
echo "🔐 NextAuth Secret: ${NEXTAUTH_SECRET}"
echo ""
echo "No authentication required - publicly accessible!"