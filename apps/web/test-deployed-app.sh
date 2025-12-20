#!/bin/bash

echo "🔍 Testing Deployed Warehouse App"
echo ""

# Get service URL
SERVICE_URL="https://warehouse-app-mesh-3yuo5fgbja-uc.a.run.app"

# Get auth token
echo "Getting authentication token..."
TOKEN=$(gcloud auth print-identity-token)

if [ -z "$TOKEN" ]; then
    echo "❌ Failed to get auth token. Please run: gcloud auth login"
    exit 1
fi

echo "✅ Got auth token"
echo ""
echo "Testing endpoints:"
echo ""

# Test root
echo "1. Testing root endpoint (/):"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -H "Authorization: Bearer $TOKEN" "$SERVICE_URL/")
HTTP_STATUS=$(echo "$RESPONSE" | grep -E "^HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed -n '1,/^HTTP_STATUS:/p' | sed '$d')

if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Success! App is running"
    echo "Response preview: $(echo "$BODY" | head -c 200)..."
else
    echo "❌ Got HTTP $HTTP_STATUS"
    echo "Response: $BODY"
fi

echo ""
echo "2. Testing health endpoint (/api/health):"
HEALTH=$(curl -s -H "Authorization: Bearer $TOKEN" "$SERVICE_URL/api/health")
echo "Response: $HEALTH"

echo ""
echo "📊 Service Details:"
gcloud run services describe warehouse-app-mesh \
    --region=us-central1 \
    --project=easyreno-poc-202512161545 \
    --format="table(
        status.url,
        status.traffic[0].percent,
        status.conditions[0].status,
        status.conditions[0].message
    )"

echo ""
echo "To view logs:"
echo "gcloud run services logs read warehouse-app-mesh --region=us-central1 --limit=50"