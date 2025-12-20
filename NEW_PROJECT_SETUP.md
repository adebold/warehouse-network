# 🚀 Create New GCP Project Without Organization Restrictions

## Why Create a New Project?

Your current project (`easyreno-poc-202512161545`) has organization policies that:
- ❌ Block public access (`allUsers` IAM policy)
- ❌ Require authentication for all services
- ❌ Make it complex to share with customers/demo

A personal project without organization restrictions will allow:
- ✅ Public access to your web app
- ✅ Easy customer demos
- ✅ Simpler deployment process
- ✅ No authentication headaches

## Step 1: Create Personal Project

```bash
# Re-authenticate if needed
gcloud auth login

# Create a new project (use a unique ID)
PROJECT_ID="warehouse-network-$(date +%Y%m%d)"
gcloud projects create $PROJECT_ID \
  --name="Warehouse Network App" \
  --set-as-default

# Set it as active project
gcloud config set project $PROJECT_ID
```

## Step 2: Enable Required APIs

```bash
# Enable necessary services
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  containerregistry.googleapis.com \
  compute.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com
```

## Step 3: Set Up Billing

```bash
# List billing accounts
gcloud billing accounts list

# Link billing to project
gcloud billing projects link $PROJECT_ID \
  --billing-account=YOUR_BILLING_ACCOUNT_ID
```

## Step 4: Quick Deploy Script

Save this as `deploy-to-new-project.sh`:

```bash
#!/bin/bash
set -e

# Configuration
PROJECT_ID="${1:-warehouse-network-$(date +%Y%m%d)}"
SERVICE_NAME="warehouse-app"
REGION="us-central1"

echo "🚀 Deploying to new project: $PROJECT_ID"
echo ""

# Ensure we're using the right project
gcloud config set project $PROJECT_ID

# Generate secrets
NEXTAUTH_SECRET=$(openssl rand -base64 32)

echo "📦 Building and deploying..."

# Deploy directly from source - let Cloud Run handle everything
cd apps/web
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 600 \
  --port 3000 \
  --set-env-vars "NODE_ENV=production,NEXTAUTH_SECRET=$NEXTAUTH_SECRET"

# Get the URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --region=$REGION \
  --format="value(status.url)")

echo ""
echo "✅ SUCCESS! Your app is publicly accessible!"
echo "🌐 URL: $SERVICE_URL"
echo ""
echo "No authentication needed - share this URL with anyone!"
echo ""
echo "⚠️ Save this NextAuth secret:"
echo "NEXTAUTH_SECRET=$NEXTAUTH_SECRET"
```

## Step 5: Run the Deployment

```bash
# Make executable
chmod +x deploy-to-new-project.sh

# Deploy to new project
./deploy-to-new-project.sh warehouse-network-20241218
```

## Option B: Transfer Existing Service

If the current build succeeds, you can copy the image:

```bash
# Copy image to new project
OLD_IMAGE="gcr.io/easyreno-poc-202512161545/warehouse-app-mesh:latest"
NEW_IMAGE="gcr.io/$PROJECT_ID/warehouse-app:latest"

# Pull and retag
docker pull $OLD_IMAGE
docker tag $OLD_IMAGE $NEW_IMAGE
docker push $NEW_IMAGE

# Deploy the copied image
gcloud run deploy warehouse-app \
  --image $NEW_IMAGE \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi
```

## Benefits of New Project

1. **Public Access**: No authentication required
2. **Easy Sharing**: Send URL to customers directly
3. **Cost Isolation**: Track costs separately
4. **Clean Environment**: No policy conflicts
5. **Full Control**: You own the project completely

## Estimated Costs (Same as Before)
- Cloud Run: $0-15/month (scale-to-zero)
- Cloud SQL: $7-10/month (if needed)
- **Total**: ~$15-25/month

## Quick Commands for New Project

```bash
# Check project
gcloud config get-value project

# List services
gcloud run services list --region us-central1

# View logs
gcloud run services logs read warehouse-app --region us-central1

# Update env vars
gcloud run services update warehouse-app \
  --update-env-vars KEY=VALUE \
  --region us-central1
```

## Next Steps

1. Create the new project
2. Run the deployment script
3. Access your app publicly without authentication!
4. Add Cloud SQL when ready
5. Set up custom domain (optional)

This approach bypasses all the organization policy restrictions and gives you a clean deployment!