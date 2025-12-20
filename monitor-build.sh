#!/bin/bash

BUILD_ID="${1:-6c3bacfc-4d5e-4a79-ac34-1500d4ad5690}"
PROJECT_ID="warehouse-adebold-202512191452"
SERVICE_NAME="warehouse-frontend"
REGION="us-central1"

echo "📊 Monitoring Build Progress"
echo "Build ID: $BUILD_ID"
echo ""

# Monitor build status
while true; do
    STATUS=$(gcloud builds describe $BUILD_ID --project=$PROJECT_ID --format="get(status)" 2>/dev/null)
    
    case $STATUS in
        "WORKING")
            echo -n "⏳ Building... "
            STEP=$(gcloud builds describe $BUILD_ID --project=$PROJECT_ID --format="get(steps[0].status)" 2>/dev/null)
            echo "Current step: $STEP"
            sleep 10
            ;;
        "SUCCESS")
            echo "✅ Build Successful!"
            
            # Deploy to Cloud Run
            echo ""
            echo "🚀 Deploying to Cloud Run..."
            NEXTAUTH_SECRET=$(openssl rand -base64 32)
            
            gcloud run deploy $SERVICE_NAME \
                --image gcr.io/$PROJECT_ID/warehouse-frontend:latest \
                --region $REGION \
                --allow-unauthenticated \
                --memory 1Gi \
                --port 8080 \
                --set-env-vars "NODE_ENV=production,NEXTAUTH_SECRET=$NEXTAUTH_SECRET" \
                --project $PROJECT_ID
            
            # Get URL
            URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format="get(status.url)")
            echo ""
            echo "🌐 Your app is live at: $URL"
            echo "🔐 NextAuth Secret: $NEXTAUTH_SECRET"
            break
            ;;
        "FAILURE")
            echo "❌ Build Failed"
            echo ""
            echo "Check logs with:"
            echo "gcloud builds log $BUILD_ID --project=$PROJECT_ID"
            break
            ;;
        *)
            echo "Status: $STATUS"
            sleep 5
            ;;
    esac
done