# GoDaddy API Secrets Setup for Google Cloud

## Manual Setup Instructions

Since we need authentication, please add these secrets manually to Google Cloud Secret Manager:

### 1. Go to Google Cloud Console
Navigate to: https://console.cloud.google.com/security/secret-manager?project=aindustries-warehouse

### 2. Create GoDaddy API Key Secret

Click "CREATE SECRET" and enter:
- **Name**: `GODADDY_API_KEY`
- **Secret value**: `9EJVgVNkYjE_XJekSwP5BkT928AwmWPeNc`
- **Replication policy**: Automatic
- Click "CREATE SECRET"

### 3. Create GoDaddy API Secret

Click "CREATE SECRET" and enter:
- **Name**: `GODADDY_API_SECRET`
- **Secret value**: `6AdQmkB2aurJNJrbUerTzW`
- **Replication policy**: Automatic
- Click "CREATE SECRET"

### 4. Update NEXTAUTH_URL

Find the existing `NEXTAUTH_URL` secret and add a new version:
- Click on `NEXTAUTH_URL`
- Click "NEW VERSION"
- **Secret value**: `https://skidspace.com`
- Click "ADD NEW VERSION"

### 5. Grant Access to Service Account

For each secret (GODADDY_API_KEY, GODADDY_API_SECRET):
1. Click on the secret name
2. Click "GRANT ACCESS"
3. Add member: `github-actions@aindustries-warehouse.iam.gserviceaccount.com`
4. Role: `Secret Manager Secret Accessor`
5. Click "SAVE"

## GitHub Secrets (Already Done via GitOps)

These are already managed through our GitHub repository:
- ✅ DATABASE_URL
- ✅ DIRECT_URL
- ✅ REDIS_URL
- ✅ NEXTAUTH_SECRET
- ✅ NEXT_PUBLIC_GA_MEASUREMENT_ID

## Cloud Run Domain Mapping

After adding the secrets, we need to set up domain mapping:

```bash
gcloud beta run domain-mappings create \
  --service=warehouse-platform-v2 \
  --domain=skidspace.com \
  --region=us-central1 \
  --project=aindustries-warehouse
```

This will:
- Create SSL certificates automatically
- Handle both skidspace.com and www.skidspace.com
- Set up proper routing

## Verification

After setup, verify:
1. DNS is pointing correctly: `dig skidspace.com`
2. SSL certificate is issued (15-20 minutes)
3. Site is accessible at https://skidspace.com

## Important Notes

- DNS changes can take 5-30 minutes to propagate
- SSL certificates are automatically managed by Google Cloud
- Both root domain and www subdomain will work
- HTTP traffic is automatically redirected to HTTPS