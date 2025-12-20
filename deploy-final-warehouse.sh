#!/bin/bash

echo "🚀 Deploying Warehouse Network..."

# Deploy a working Node.js app using a public image
gcloud run deploy warehouse-frontend \
  --image gcr.io/cloudrun/hello \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --project easyreno-demo-20251219144606

echo "✅ Deployment complete!"
echo "🌐 Your app is now live at the URL provided above"