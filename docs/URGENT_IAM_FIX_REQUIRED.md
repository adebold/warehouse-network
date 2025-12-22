# 🚨 URGENT: IAM Permission Fix Required

## The Issue
The GitOps deployment is failing because the GitHub Actions service account (`github-actions-deploy@aindustries-warehouse.iam.gserviceaccount.com`) doesn't have permission to act as the Cloud Run service account (`warehouse-app@aindustries-warehouse.iam.gserviceaccount.com`).

## Quick Fix (Run These Commands)

1. **First, authenticate with Google Cloud:**
```bash
gcloud auth login
```

2. **Run the IAM fix script:**
```bash
./scripts/fix-iam-permissions.sh
```

## Alternative: Manual Commands

If the script fails, run these commands directly:

```bash
# Set your project
gcloud config set project aindustries-warehouse

# Grant serviceAccountUser role
gcloud iam service-accounts add-iam-policy-binding \
  warehouse-app@aindustries-warehouse.iam.gserviceaccount.com \
  --member="serviceAccount:github-actions-deploy@aindustries-warehouse.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Grant Cloud Run Admin role
gcloud projects add-iam-policy-binding aindustries-warehouse \
  --member="serviceAccount:github-actions-deploy@aindustries-warehouse.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Grant Artifact Registry Writer role
gcloud projects add-iam-policy-binding aindustries-warehouse \
  --member="serviceAccount:github-actions-deploy@aindustries-warehouse.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"
```

## Verify the Fix

After running the commands, check permissions:

```bash
# Check service account permissions
gcloud iam service-accounts get-iam-policy \
  warehouse-app@aindustries-warehouse.iam.gserviceaccount.com

# Should show:
# bindings:
# - members:
#   - serviceAccount:github-actions-deploy@aindustries-warehouse.iam.gserviceaccount.com
#   role: roles/iam.serviceAccountUser
```

## Re-run the Workflow

After fixing permissions, trigger a new deployment:

```bash
# Option 1: Push a trivial change
git commit --allow-empty -m "chore: trigger deployment after IAM fix" && git push

# Option 2: Re-run the failed workflow
gh run rerun 20434183594
```

## Why This Is Needed

Google Cloud requires explicit permission for one service account to impersonate another. This is a security feature that prevents unauthorized access to resources. The GitHub Actions service account needs this permission to deploy the Cloud Run service with the appropriate runtime service account.

---

**Note**: This is a one-time setup. Once fixed, all future deployments will work automatically.