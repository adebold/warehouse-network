#!/bin/bash

PROJECT_ID="warehouse-adebold-202512191452"
SERVICE_NAME="warehouse-app"
REGION="us-central1"

echo "📊 Monitoring Deployment Progress"
echo "Project: $PROJECT_ID"
echo ""

while true; do
    # Check if service exists
    SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
        --region=$REGION \
        --project=$PROJECT_ID \
        --format="value(status.url)" 2>/dev/null)
    
    if [ ! -z "$SERVICE_URL" ]; then
        echo ""
        echo "✅ Deployment Complete!"
        echo "🌐 Public URL: $SERVICE_URL"
        echo ""
        echo "Testing public access..."
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL")
        
        if [ "$HTTP_STATUS" = "200" ]; then
            echo "✅ App is publicly accessible!"
            echo ""
            echo "🎉 Success! Visit your app at:"
            echo "$SERVICE_URL"
        else
            echo "⚠️ Got HTTP $HTTP_STATUS - App may still be starting"
        fi
        break
    else
        echo -n "."
        sleep 5
    fi
done