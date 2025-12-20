# GCP Cloud Run Deployment Status

## ✅ What's Working

1. **Google Cloud Project**: `easyreno-poc-202512161545` is set up
2. **Cloud Run API**: Enabled and functional
3. **Service Deployment**: Successfully deployed test service `hello-warehouse`
4. **Service URL**: https://hello-warehouse-736504501114.us-central1.run.app

## ⚠️ Current Issues

1. **Organization Policy**: Your GCP organization has policies preventing public access (allUsers)
2. **Build Issues**: Missing package-lock.json prevents npm ci from working in Cloud Build
3. **IAM Restrictions**: Cannot set public invoker due to organization policies

## 🚀 Next Steps to Complete Deployment

### Option 1: Fix Organization Policy (Recommended)
```bash
# Check organization policies
gcloud org-policies list --project=easyreno-poc-202512161545

# If you have permissions, disable the constraint
gcloud org-policies reset constraints/iam.allowedPolicyMemberDomains \
  --project=easyreno-poc-202512161545
```

### Option 2: Use Authenticated Access
Instead of public access, use authenticated access:
```bash
# Deploy without --allow-unauthenticated
gcloud run deploy warehouse-network \
  --source apps/web \
  --region us-central1 \
  --project easyreno-poc-202512161545
  
# Access with authentication
gcloud auth print-identity-token
```

### Option 3: Deploy to Personal Project
Create a new project without organization restrictions:
```bash
gcloud projects create warehouse-network-personal-[UNIQUE_ID]
gcloud config set project warehouse-network-personal-[UNIQUE_ID]
```

## 📦 To Deploy Your App (Once Policy Fixed)

1. **Generate package-lock.json**:
```bash
cd apps/web
npm install
git add package-lock.json
git commit -m "Add package-lock.json for Cloud Run"
```

2. **Deploy**:
```bash
gcloud run deploy warehouse-network \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 1Gi \
  --set-env-vars "NODE_ENV=production"
```

## 💰 Cost Estimate
- Cloud Run: $0-5/month (with scale-to-zero)
- Cloud SQL: $7-10/month (f1-micro)
- Redis: $25/month (optional)
- **Total: ~$35-40/month**

## 🔧 Quick Fixes

### For Build Issues:
1. Add package-lock.json to your repository
2. Use Dockerfile.simple which uses npm install instead of npm ci
3. Build locally and push to Container Registry

### For Access Issues:
1. Contact your GCP organization admin to allow Cloud Run public access
2. Use Cloud Load Balancer with custom domain
3. Set up Identity-Aware Proxy (IAP) for authentication

## 📞 Support
- Check organization policies: https://console.cloud.google.com/iam-admin/orgpolicies
- Cloud Run docs: https://cloud.google.com/run/docs
- Contact your GCP admin about the `iam.allowedPolicyMemberDomains` constraint