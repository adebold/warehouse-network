#!/bin/bash
set -e

echo "🚀 Minimal Cloud Run Deployment Test"
echo ""

PROJECT_ID="easyreno-poc-202512161545"
SERVICE_NAME="warehouse-test"
REGION="us-central1"

# Create a minimal test directory
mkdir -p cloud-run-test
cd cloud-run-test

# Create minimal package.json
cat > package.json << 'EOF'
{
  "name": "warehouse-network-test",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  }
}
EOF

# Create minimal server
cat > server.js << 'EOF'
const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Warehouse Network - Cloud Run</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; }
          h1 { color: #0066cc; }
          .status { background: #f0f8ff; padding: 20px; border-radius: 8px; }
        </style>
      </head>
      <body>
        <h1>🚀 Warehouse Network on Cloud Run</h1>
        <div class="status">
          <p><strong>Status:</strong> Application deployed successfully!</p>
          <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
          <p><strong>Project:</strong> ${process.env.PROJECT_ID || 'Not set'}</p>
        </div>
        <p>This is a minimal deployment to verify Cloud Run is working.</p>
        <p>Next steps:</p>
        <ul>
          <li>Deploy the full Next.js application</li>
          <li>Set up Cloud SQL database</li>
          <li>Configure environment variables</li>
        </ul>
      </body>
    </html>
  `);
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
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
RUN npm install
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
EOF

echo "📦 Deploying minimal test app to Cloud Run..."

# Deploy
gcloud run deploy ${SERVICE_NAME} \
  --source . \
  --region ${REGION} \
  --project ${PROJECT_ID} \
  --allow-unauthenticated \
  --set-env-vars "PROJECT_ID=${PROJECT_ID}"

# Get URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format="value(status.url)")

# Clean up
cd ..
rm -rf cloud-run-test

echo ""
echo "✅ Test deployment successful!"
echo "🌐 URL: ${SERVICE_URL}"
echo ""
echo "Visit the URL to verify Cloud Run is working."
echo "Once verified, we can deploy the full application."