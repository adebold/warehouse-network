#!/bin/bash

echo "Checking build status..."
gcloud builds list --limit=1 --project=easyreno-poc-202512161545

echo ""
echo "If the build is successful, testing the deployment..."
SERVICE_URL=$(gcloud run services describe warehouse-app-mesh --region=us-central1 --project=easyreno-poc-202512161545 --format='value(status.url)' 2>/dev/null || echo "Service not found")

if [ "$SERVICE_URL" != "Service not found" ]; then
    echo "Testing deployment at: $SERVICE_URL"
    echo ""
    echo "Basic connectivity test:"
    curl -I "$SERVICE_URL" --max-time 10
    echo ""
    echo "If you see HTTP 200 or 301/302, the deployment is working!"
else
    echo "Service not deployed yet or deployment failed."
fi