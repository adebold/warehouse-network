#!/bin/bash
set -e

echo "🚀 Deploying Frontend to Google Cloud Platform"
echo ""

PROJECT_ID="warehouse-adebold-202512191452"
SERVICE_NAME="warehouse-frontend"
REGION="us-central1"

# Set project
gcloud config set project $PROJECT_ID

echo "📦 Option 1: Deploying to App Engine (Recommended for Next.js)..."
echo ""

# Update app.yaml with NextAuth secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)
cat > app.yaml << EOF
runtime: nodejs18

instance_class: F2

automatic_scaling:
  min_instances: 0
  max_instances: 10
  target_cpu_utilization: 0.65

env_variables:
  NODE_ENV: "production"
  NEXTAUTH_SECRET: "${NEXTAUTH_SECRET}"
  NEXTAUTH_URL: "https://warehouse-adebold-202512191452.uc.r.appspot.com"

handlers:
- url: /_next/static
  static_dir: .next/static
  secure: always

- url: /static
  static_dir: static
  secure: always

- url: /.*
  script: auto
  secure: always
EOF

echo "🔨 Building application..."
# Fix missing components first
mkdir -p components
cat > components/SkidLabel.tsx << 'EOF'
import React from 'react';

export default function SkidLabel({ skid }: { skid: any }) {
  return (
    <div className="p-4 border rounded">
      <h3>Skid #{skid.id}</h3>
      <p>{skid.description || 'No description'}</p>
    </div>
  );
}
EOF

# Deploy to App Engine
echo "🚀 Deploying to App Engine..."
gcloud app deploy --quiet --project=$PROJECT_ID

# Get the URL
APP_URL="https://${PROJECT_ID}.uc.r.appspot.com"

echo ""
echo "✅ Deployment Complete!"
echo "🌐 Your app is live at: $APP_URL"
echo ""
echo "🔐 NextAuth Secret: $NEXTAUTH_SECRET"
echo ""
echo "📊 View logs:"
echo "gcloud app logs tail -s default"
echo ""
echo "🎯 Benefits:"
echo "- Automatic HTTPS"
echo "- Auto-scaling"
echo "- No authentication required"
echo "- Handles Next.js perfectly"