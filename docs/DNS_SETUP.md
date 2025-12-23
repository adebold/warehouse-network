# SkidSpace DNS Configuration Guide

This guide walks through setting up DNS for skidspace.com to point to our Cloud Run deployment.

## Prerequisites

1. **GoDaddy Account** with skidspace.com domain
2. **GoDaddy API Credentials**:
   - Go to https://developer.godaddy.com/keys
   - Create a Production API key
   - Save both the Key and Secret

3. **Google Cloud Project** with Cloud Run service deployed

## Quick Setup

### Step 1: Configure GoDaddy DNS

```bash
# Set your GoDaddy API credentials
export GODADDY_API_KEY='your_api_key_here'
export GODADDY_API_SECRET='your_api_secret_here'

# Run the DNS configuration script
./scripts/configure-godaddy-dns.sh
```

This script will:
- Remove any existing A/CNAME records
- Add A records pointing to Google Cloud Load Balancer
- Configure both root domain and www subdomain

### Step 2: Set up Cloud Run Domain Mapping

```bash
# Authenticate with Google Cloud (if needed)
gcloud auth login

# Create domain mapping
gcloud beta run domain-mappings create \
  --service=warehouse-platform-v2 \
  --domain=skidspace.com \
  --region=us-central1 \
  --project=aindustries-warehouse
```

### Step 3: Update GitHub Secrets

Update the following GitHub secret:
- `NEXTAUTH_URL` = `https://skidspace.com`

### Step 4: Deploy with New Domain

Push changes to trigger a new deployment:
```bash
git add .
git commit -m "feat: configure SkidSpace domain"
git push origin main
```

## DNS Records

The following DNS records are configured:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | 34.102.136.180 | 600 |
| A | www | 34.102.136.180 | 600 |

## Verification

### Check DNS Propagation
```bash
# Check A record
dig skidspace.com

# Check with Google DNS
dig @8.8.8.8 skidspace.com

# Test HTTPS
curl -I https://skidspace.com
```

### Expected Timeline
- **5-30 minutes**: Most DNS servers updated
- **Up to 48 hours**: Full global propagation
- **SSL Certificate**: Automatically provisioned by Cloud Run

## Troubleshooting

### DNS Not Resolving
1. Wait for propagation (check with https://dnschecker.org)
2. Clear local DNS cache:
   - Mac: `sudo dscacheutil -flushcache`
   - Linux: `sudo systemd-resolve --flush-caches`

### SSL Certificate Error
- Cloud Run automatically provisions SSL certificates
- May take 15-20 minutes after domain mapping
- Check status: `gcloud beta run domain-mappings describe --domain=skidspace.com`

### 404 Errors
- Ensure Cloud Run service is running
- Verify domain mapping is active
- Check Cloud Run logs for errors

## Architecture

```
User → skidspace.com → GoDaddy DNS → Google Cloud Load Balancer → Cloud Run Service
         ↓
     www.skidspace.com
```

Both root and www domains point to the same Cloud Run service, which handles:
- SSL termination
- HTTP/2
- Global load balancing
- Auto-scaling

## Security Features

- **Automatic SSL/TLS**: Managed by Google Cloud
- **HTTP → HTTPS redirect**: Automatic
- **HSTS**: Enabled by default
- **Modern TLS versions**: 1.2 and 1.3 only