#!/bin/bash

echo "🔍 Testing Public Deployment"
echo ""

PROJECT_ID="warehouse-adebold-202512191452"
SERVICE_NAME="warehouse-app"
REGION="us-central1"

# Check if service exists
echo "Checking deployment status..."
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format="value(status.url)" 2>/dev/null)

if [ -z "$SERVICE_URL" ]; then
    echo "❌ Service not found. Deployment may still be in progress."
    echo ""
    echo "Check build status:"
    echo "gcloud builds list --project=$PROJECT_ID --limit=5"
    exit 1
fi

echo "✅ Service found!"
echo "🌐 Public URL: $SERVICE_URL"
echo ""

# Test public access (no authentication needed!)
echo "Testing public access..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL")

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ SUCCESS! App is publicly accessible!"
    echo ""
    echo "🎉 Your warehouse app is live at:"
    echo "$SERVICE_URL"
    echo ""
    echo "Share this URL with anyone - no login required!"
elif [ "$HTTP_STATUS" = "403" ]; then
    echo "❌ Got 403 - Authentication still required"
    echo "This shouldn't happen in the new project."
elif [ "$HTTP_STATUS" = "503" ]; then
    echo "⚠️ Service is deployed but app may still be starting up"
    echo "Try again in a minute."
else
    echo "❌ Got HTTP $HTTP_STATUS"
fi

echo ""
echo "View logs:"
echo "gcloud run services logs read $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"