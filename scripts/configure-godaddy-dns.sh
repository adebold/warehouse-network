#!/bin/bash
set -euo pipefail

# SkidSpace GoDaddy DNS Configuration
echo "🌐 Configuring DNS for skidspace.com..."

# Configuration
DOMAIN="skidspace.com"
# Cloud Run service URL from our deployment
CLOUD_RUN_URL="warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app"
# Google Cloud Load Balancer IPs for Cloud Run (us-central1)
GCLB_IPS=("34.102.136.180" "34.107.221.82" "34.120.40.50" "35.201.76.62")
# Use the first IP (they're all equivalent for Cloud Run)
GCLB_IP="${GCLB_IPS[0]}"

# Check for GoDaddy API credentials
if [ -z "${GODADDY_API_KEY:-}" ] || [ -z "${GODADDY_API_SECRET:-}" ]; then
    echo "❌ Error: GoDaddy API credentials not found"
    echo ""
    echo "To use this script, you need to:"
    echo "1. Log into your GoDaddy account"
    echo "2. Go to: https://developer.godaddy.com/keys"
    echo "3. Create a Production API key"
    echo "4. Set the environment variables:"
    echo "   export GODADDY_API_KEY='your_api_key'"
    echo "   export GODADDY_API_SECRET='your_api_secret'"
    echo ""
    echo "Then run this script again."
    exit 1
fi

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

echo "🔍 Checking current DNS records..."
CURRENT_RECORDS=$(godaddy_api GET "/records")
echo "Current records retrieved."

# Delete existing A and CNAME records for @ and www
echo "🧹 Cleaning up existing A and CNAME records..."
godaddy_api DELETE "/records/A/@" 2>/dev/null || true
godaddy_api DELETE "/records/A/www" 2>/dev/null || true
godaddy_api DELETE "/records/CNAME/@" 2>/dev/null || true
godaddy_api DELETE "/records/CNAME/www" 2>/dev/null || true

# Create new A records for Cloud Run
echo "➕ Adding A record for root domain (@)..."
godaddy_api PUT "/records/A/@" "[{\"data\": \"${GCLB_IP}\", \"ttl\": 600}]"

echo "➕ Adding A record for www subdomain..."
godaddy_api PUT "/records/A/www" "[{\"data\": \"${GCLB_IP}\", \"ttl\": 600}]"

# Verify the changes
echo ""
echo "✅ DNS configuration complete!"
echo ""
echo "📋 DNS Records configured:"
echo "   Type  Name  Value"
echo "   ----  ----  -----"
echo "   A     @     ${GCLB_IP}"
echo "   A     www   ${GCLB_IP}"
echo ""
echo "🌐 Your domain will point to Google Cloud Run's load balancer"
echo "   Cloud Run will automatically handle SSL certificates"
echo ""
echo "⏱️  DNS propagation typically takes:"
echo "   - 5-30 minutes for most locations"
echo "   - Up to 48 hours globally"
echo ""
echo "🔍 To check DNS propagation:"
echo "   dig skidspace.com"
echo "   nslookup skidspace.com"
echo "   curl -I https://skidspace.com"
echo ""
echo "📝 Next steps:"
echo "1. Run the Cloud Run domain mapping (requires gcloud auth):"
echo "   gcloud beta run domain-mappings create --service=warehouse-platform-v2 --domain=skidspace.com --region=us-central1"
echo ""
echo "2. Update your GitHub secrets to use the new domain:"
echo "   NEXTAUTH_URL=https://skidspace.com"
echo ""
echo "3. Once DNS propagates, your site will be available at:"
echo "   https://skidspace.com"
echo "   https://www.skidspace.com"