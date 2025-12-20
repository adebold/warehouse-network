#!/bin/bash
set -e

echo "🚀 Creating and deploying to a new GCP project"
echo ""

# Generate unique project ID
PROJECT_ID="warehouse-app-$(date +%Y%m%d%H%M)"
SERVICE_NAME="warehouse-app"
REGION="us-central1"

echo "📋 Project Details:"
echo "Project ID: $PROJECT_ID"
echo "Service: $SERVICE_NAME"
echo "Region: $REGION"
echo ""

# Create the project
echo "1️⃣ Creating new project..."
gcloud projects create $PROJECT_ID \
  --name="Warehouse Network App" \
  --set-as-default

# Set as active project
gcloud config set project $PROJECT_ID

# List billing accounts
echo ""
echo "2️⃣ Available billing accounts:"
gcloud billing accounts list --format="table(name, displayName, open)"

echo ""
echo "3️⃣ Please link billing account:"
echo "Run: gcloud billing projects link $PROJECT_ID --billing-account=YOUR_BILLING_ACCOUNT_ID"
echo ""
echo "After linking billing, run:"
echo "./enable-and-deploy.sh $PROJECT_ID"

# Create the follow-up script
cat > enable-and-deploy.sh << EOF
#!/bin/bash
set -e

PROJECT_ID=\${1:-$PROJECT_ID}
SERVICE_NAME="warehouse-app"
REGION="us-central1"

echo "🔧 Continuing deployment for project: \$PROJECT_ID"

# Set project
gcloud config set project \$PROJECT_ID

# Enable APIs
echo "📡 Enabling required APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  artifactregistry.googleapis.com

# Deploy from source
echo "🚀 Deploying application..."
cd apps/web

# Generate secrets
NEXTAUTH_SECRET=\$(openssl rand -base64 32)

gcloud run deploy \$SERVICE_NAME \
  --source . \
  --region \$REGION \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 600 \
  --port 3000 \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_SECRET=\$NEXTAUTH_SECRET"

# Get the URL
SERVICE_URL=\$(gcloud run services describe \$SERVICE_NAME \
  --region=\$REGION \
  --format="value(status.url)")

echo ""
echo "✅ SUCCESS! Your app is deployed!"
echo "🌐 Public URL: \$SERVICE_URL"
echo ""
echo "🔐 Save this NextAuth secret:"
echo "NEXTAUTH_SECRET=\$NEXTAUTH_SECRET"
echo ""
echo "Your warehouse app is now publicly accessible without authentication!"
EOF

chmod +x enable-and-deploy.sh

echo ""
echo "✅ Setup script created!"
echo "Follow the steps above to complete deployment."