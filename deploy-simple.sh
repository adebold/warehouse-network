#!/bin/bash
set -e

echo "🚀 Simple Cloud Run Deployment"
echo ""

PROJECT_ID="easyreno-poc-202512161545"
SERVICE_NAME="warehouse-network-web"
REGION="us-central1"

echo "📦 Creating a simple Node.js app for deployment..."

# Create a minimal deployment directory
mkdir -p deploy-temp
cd deploy-temp

# Create package.json
cat > package.json << 'EOF'
{
  "name": "warehouse-network-web",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
EOF

# Create a simple server
cat > server.js << 'EOF'
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.json({
    message: 'Warehouse Network API',
    status: 'ready',
    deployment: 'Cloud Run',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'production'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
EOF

# Create Dockerfile
cat > Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
EOF

echo "🏗️  Building and deploying to Cloud Run..."
echo "   This will create a test deployment first."
echo ""

# Deploy using source
gcloud run deploy ${SERVICE_NAME}-test \
  --source . \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --port 8080

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME}-test --region=${REGION} --format="value(status.url)")

echo ""
echo "✅ Test deployment successful!"
echo "🌐 Service URL: $SERVICE_URL"
echo "🔍 Health check: $SERVICE_URL/api/health"
echo ""
echo "This is a simple test deployment to verify Cloud Run is working."
echo "To deploy the full application, you'll need to:"
echo "1. Enable the required APIs in the Google Cloud Console"
echo "2. Set up Cloud SQL and Redis"
echo "3. Configure environment variables"
echo ""

# Cleanup
cd ..
rm -rf deploy-temp

echo "✨ Test deployment complete!"