#!/bin/bash

echo "🧪 Testing basic Cloud Run deployment..."

# Create a temporary directory for test deployment
mkdir -p test-deploy
cp test-app.js test-deploy/
cp Dockerfile.test test-deploy/Dockerfile
echo '{"name":"test-app","version":"1.0.0"}' > test-deploy/package.json

# Deploy the test app
cd test-deploy
gcloud run deploy warehouse-test \
    --source . \
    --region us-central1 \
    --allow-unauthenticated \
    --platform managed

cd ..
echo "✅ Test deployment complete!"