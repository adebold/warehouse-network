#!/bin/bash

echo "🧪 Testing minimal GCP deployment first..."

# Create temporary directory
mkdir -p test-minimal
cp minimal-app.js test-minimal/
echo '{"name":"warehouse-test","version":"1.0.0","dependencies":{"express":"^4.18.0"}}' > test-minimal/package.json
cp Dockerfile.minimal-test test-minimal/Dockerfile

cd test-minimal

echo "Deploying minimal test app..."
gcloud run deploy warehouse-test-minimal \
    --source . \
    --region us-central1 \
    --allow-unauthenticated \
    --platform managed

cd ..
echo "✅ If this works, we know Cloud Run is functioning!"