#!/bin/bash
# SkidSpace Static Asset Upload Script

set -e

BUCKET_NAME="skidspace-static-assets"
LOCAL_ASSETS_DIR="apps/web/public"

echo "🚀 Uploading SkidSpace static assets to GCP Storage..."

# Upload brand assets
echo "📦 Uploading brand assets..."
gsutil -m cp -r "${LOCAL_ASSETS_DIR}/brand/*" "gs://${BUCKET_NAME}/brand/"

# Set cache headers for brand assets (1 year cache)
echo "⚙️ Setting cache headers for brand assets..."
gsutil setmeta -h "Cache-Control:public, max-age=31536000" "gs://${BUCKET_NAME}/brand/*"

# Upload other static assets if they exist
if [ -d "${LOCAL_ASSETS_DIR}/images" ]; then
    echo "🖼️ Uploading images..."
    gsutil -m cp -r "${LOCAL_ASSETS_DIR}/images/*" "gs://${BUCKET_NAME}/images/"
    gsutil setmeta -h "Cache-Control:public, max-age=604800" "gs://${BUCKET_NAME}/images/*"
fi

if [ -d "${LOCAL_ASSETS_DIR}/icons" ]; then
    echo "🎯 Uploading icons..."
    gsutil -m cp -r "${LOCAL_ASSETS_DIR}/icons/*" "gs://${BUCKET_NAME}/icons/"
    gsutil setmeta -h "Cache-Control:public, max-age=31536000" "gs://${BUCKET_NAME}/icons/*"
fi

echo "✅ Asset upload complete!"
echo "CDN URLs:"
echo "  Brand assets: https://storage.googleapis.com/${BUCKET_NAME}/brand/"
echo "  Base URL: https://storage.googleapis.com/${BUCKET_NAME}/"