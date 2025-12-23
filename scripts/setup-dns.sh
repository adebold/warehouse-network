#!/bin/bash
set -euo pipefail

# SkidSpace DNS Configuration Script
echo "🚀 Setting up DNS for skidspace.com..."

# Configuration
DOMAIN="skidspace.com"
CLOUD_RUN_SERVICE="warehouse-platform-v2"
CLOUD_RUN_REGION="us-central1"
PROJECT_ID="aindustries-warehouse"

# Check for GoDaddy API credentials
if [ -z "${GODADDY_API_KEY:-}" ] || [ -z "${GODADDY_API_SECRET:-}" ]; then
    echo "❌ Error: GoDaddy API credentials not found"
    echo "Please set GODADDY_API_KEY and GODADDY_API_SECRET environment variables"
    exit 1
fi

# Step 1: Configure Cloud Run domain mapping
echo "📍 Step 1: Setting up Cloud Run domain mapping..."
gcloud beta run domain-mappings create \
    --service="${CLOUD_RUN_SERVICE}" \
    --domain="${DOMAIN}" \
    --region="${CLOUD_RUN_REGION}" \
    --project="${PROJECT_ID}" || echo "Domain mapping may already exist"

# Get the required DNS records from Cloud Run
echo "📋 Getting DNS configuration from Cloud Run..."
MAPPING_INFO=$(gcloud beta run domain-mappings describe \
    --domain="${DOMAIN}" \
    --region="${CLOUD_RUN_REGION}" \
    --project="${PROJECT_ID}" \
    --format=json)

# Extract DNS records needed
GCLB_IP=$(echo "$MAPPING_INFO" | jq -r '.status.resourceRecords[] | select(.type == "A") | .rrdata')
CNAME_TARGET=$(echo "$MAPPING_INFO" | jq -r '.status.resourceRecords[] | select(.type == "CNAME") | .rrdata // empty')

if [ -z "$GCLB_IP" ] && [ -z "$CNAME_TARGET" ]; then
    echo "⏳ Waiting for Cloud Run to generate DNS records..."
    sleep 10
    # Retry
    MAPPING_INFO=$(gcloud beta run domain-mappings describe \
        --domain="${DOMAIN}" \
        --region="${CLOUD_RUN_REGION}" \
        --project="${PROJECT_ID}" \
        --format=json)
    GCLB_IP=$(echo "$MAPPING_INFO" | jq -r '.status.resourceRecords[] | select(.type == "A") | .rrdata')
fi

echo "📍 Cloud Run Load Balancer IP: ${GCLB_IP:-Not available yet}"
echo "📍 CNAME Target: ${CNAME_TARGET:-Not needed}"

# Step 2: Configure GoDaddy DNS records
echo "🌐 Step 2: Configuring GoDaddy DNS records..."

# Function to make GoDaddy API calls
godaddy_api() {
    local method=$1
    local endpoint=$2
    local data=${3:-}
    
    curl -s -X "$method" \
        "https://api.godaddy.com/v1/domains/${DOMAIN}${endpoint}" \
        -H "Authorization: sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}" \
        -H "Content-Type: application/json" \
        ${data:+-d "$data"}
}

# Delete existing A and CNAME records for @ and www
echo "🧹 Cleaning up existing DNS records..."
godaddy_api DELETE "/records/A/@" || true
godaddy_api DELETE "/records/A/www" || true
godaddy_api DELETE "/records/CNAME/www" || true

# Create new DNS records
if [ -n "$GCLB_IP" ]; then
    echo "➕ Adding A record for root domain..."
    godaddy_api PUT "/records/A/@" "[{\"data\": \"${GCLB_IP}\", \"ttl\": 600}]"
    
    echo "➕ Adding A record for www subdomain..."
    godaddy_api PUT "/records/A/www" "[{\"data\": \"${GCLB_IP}\", \"ttl\": 600}]"
else
    echo "⚠️  Cloud Run IP not available yet. You may need to run this script again."
fi

# Step 3: Set up www redirect (optional)
echo "🔄 Step 3: Setting up www subdomain..."
# Cloud Run handles both root and www automatically when both A records point to the same IP

# Step 4: Update Cloud Run service with new URL
echo "🔧 Step 4: Updating Cloud Run environment variables..."
gcloud run services update "${CLOUD_RUN_SERVICE}" \
    --region="${CLOUD_RUN_REGION}" \
    --project="${PROJECT_ID}" \
    --update-env-vars "NEXTAUTH_URL=https://${DOMAIN}"

# Step 5: Verify DNS propagation
echo "🔍 Step 5: Checking DNS propagation..."
echo "DNS changes may take up to 48 hours to propagate globally."
echo ""
echo "Current DNS records for ${DOMAIN}:"
echo "----------------------------------------"

# Check current DNS resolution
echo "A record lookup:"
dig +short A "${DOMAIN}" @8.8.8.8 || echo "Not propagated yet"
echo ""
echo "www A record lookup:"
dig +short A "www.${DOMAIN}" @8.8.8.8 || echo "Not propagated yet"

# Final instructions
echo ""
echo "✅ DNS configuration complete!"
echo ""
echo "📋 Next steps:"
echo "1. Wait for DNS propagation (usually 5-30 minutes)"
echo "2. Verify SSL certificate is issued (automatic via Cloud Run)"
echo "3. Test the site at https://${DOMAIN}"
echo ""
echo "🔗 Cloud Run Console: https://console.cloud.google.com/run/detail/${CLOUD_RUN_REGION}/${CLOUD_RUN_SERVICE}/metrics?project=${PROJECT_ID}"
echo ""
echo "💡 To check DNS propagation status:"
echo "   dig ${DOMAIN}"
echo "   nslookup ${DOMAIN}"
echo "   curl -I https://${DOMAIN}"