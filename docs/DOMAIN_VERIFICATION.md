# Domain Verification for SkidSpace.com

## Quick Steps to Verify Domain

Google Cloud requires domain ownership verification before mapping custom domains.

### Option 1: TXT Record Verification (Recommended)

1. Google Search Console should have opened in your browser
2. Choose **"Domain"** option (not URL prefix)
3. Enter: `skidspace.com`
4. Google will provide a TXT record like:
   ```
   google-site-verification=XXXXXXXXXXXX
   ```

5. Add this TXT record to GoDaddy:

```bash
# Use the configure script with TXT record
export GODADDY_API_KEY='9EJVgVNkYjE_XJekSwP5BkT928AwmWPeNc'
export GODADDY_API_SECRET='6AdQmkB2aurJNJrbUerTzW'

# Add TXT record via API
curl -X PUT "https://api.godaddy.com/v1/domains/skidspace.com/records/TXT/@" \
  -H "Authorization: sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}" \
  -H "Content-Type: application/json" \
  -d '[{"data": "google-site-verification=YOUR_VERIFICATION_CODE", "ttl": 600}]'
```

6. Click "Verify" in Google Search Console
7. Once verified, retry the domain mapping:

```bash
gcloud beta run domain-mappings create \
  --service=warehouse-platform-v2 \
  --domain=skidspace.com \
  --region=us-central1
```

### Option 2: HTML File Verification

1. Download the HTML verification file from Google
2. Upload it to your Cloud Run service root
3. Deploy and verify

### Current Status

- ✅ DNS configured correctly
- ✅ Cloud Run service running
- ⏳ Domain verification needed
- ⏳ Domain mapping (after verification)
- ⏳ SSL certificate (automatic after mapping)

## Alternative: Use Subdomain

If you want to skip verification temporarily, you could use:
- `app.aindustries.co` (already verified)
- Configure CNAME in your aindustries.co DNS

## Why This is Needed

Google Cloud requires domain verification to prevent domain hijacking and ensure you own the domain you're trying to map. This is a one-time process per domain.