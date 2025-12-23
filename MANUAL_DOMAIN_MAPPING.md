# Manual Domain Mapping for SkidSpace

Since the CLI isn't recognizing the verification yet, use the Google Cloud Console:

## Quick Steps:

1. **Go to Cloud Run Domain Mappings**:
   https://console.cloud.google.com/run/domains?project=aindustries-warehouse

2. **Click "ADD MAPPING"**

3. **Fill in:**
   - Service: `warehouse-platform-v2`
   - Region: `us-central1`
   - Domain: `skidspace.com`

4. **Click "SUBMIT"**

## If that doesn't work:

The issue might be that the verification needs to be done through the same Google account that owns the GCP project.

### Alternative approach:

1. **Go to Webmaster Central**:
   https://www.google.com/webmasters/verification/

2. **Add Property** → Domain → `skidspace.com`

3. **Verify with existing TXT record**

4. **Then retry Cloud Run mapping**

## Current Status:
- ✅ DNS pointing to Google (34.102.136.180)
- ✅ Search Console verified
- ⏳ Cloud Run needs to recognize verification
- ✅ Service running at: https://warehouse-platform-v2-yrmxxfm5sa-uc.a.run.app

The verification sync between Search Console and Cloud Run can take 5-10 minutes.