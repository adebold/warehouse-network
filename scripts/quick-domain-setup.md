# Quick Domain Setup for SkidSpace

## Why skidspace.com isn't working yet

DNS is pointing correctly to Google Cloud (✅), but Google Cloud doesn't know that skidspace.com should route to your Cloud Run service.

## Fix it in 2 minutes:

### Option 1: Command Line (Recommended)
```bash
# Login to Google Cloud
gcloud auth login

# Create the domain mapping
gcloud beta run domain-mappings create \
  --service=warehouse-platform-v2 \
  --domain=skidspace.com \
  --region=us-central1 \
  --project=aindustries-warehouse
```

### Option 2: Google Cloud Console UI
1. Go to: https://console.cloud.google.com/run/domains?project=aindustries-warehouse
2. Click "ADD MAPPING"
3. Select:
   - Service: `warehouse-platform-v2`
   - Region: `us-central1`
   - Domain: `skidspace.com`
4. Click "SUBMIT"

## What happens next:
1. Google verifies DNS is pointing correctly (it is!)
2. SSL certificates are automatically created (15-20 mins)
3. Both skidspace.com and www.skidspace.com will work
4. HTTP automatically redirects to HTTPS

## Current Status:
- ✅ DNS configured (skidspace.com → 34.102.136.180)
- ✅ Cloud Run service running
- ⏳ Domain mapping needed (this fixes the connection reset)
- ⏳ SSL certificate (automatic after mapping)

Your site IS running at: https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app