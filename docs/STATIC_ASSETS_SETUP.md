# SkidSpace Static Assets Infrastructure

## Overview

SkidSpace uses Google Cloud Storage for static asset delivery with global CDN capabilities.

## Infrastructure

### GCP Storage Bucket
- **Bucket Name**: `skidspace-static-assets`
- **Location**: `us-central1`
- **Storage Class**: `STANDARD`
- **Public Access**: Enabled for read-only access
- **Web Configuration**: Enabled

### CDN Configuration
- **Base URL**: `https://storage.googleapis.com/skidspace-static-assets`
- **Cache Headers**: 1 year cache for brand assets (`max-age=31536000`)
- **Content Types**: Properly configured for SVG, PNG, JPG, etc.

## Assets Structure

```
skidspace-static-assets/
├── brand/
│   ├── logo-icon.svg          # 256x256 icon for favicons, map pins
│   ├── logo-primary.svg       # 640x160 horizontal logo
│   ├── map-pin.svg           # Blue map pin (inactive)
│   ├── map-pin-active.svg    # Orange map pin (active)
│   └── README.md             # Brand guidelines
└── (future asset categories)
```

## Environment Configuration

### Production
Add to your production environment:
```
NEXT_PUBLIC_CDN_BASE_URL=https://storage.googleapis.com/skidspace-static-assets
```

### Development
Leave empty for local assets:
```
NEXT_PUBLIC_CDN_BASE_URL=
```

## Usage in Code

```typescript
import { getAssetUrl, BRAND_ASSETS } from '@/lib/asset-urls';

// Use helper function (recommended)
const logoUrl = getAssetUrl('logoIcon');

// Direct access
const logoUrl = BRAND_ASSETS.logoIcon;
```

## Asset Management

### Upload New Assets
```bash
# Run upload script
./scripts/upload-assets.sh

# Or manually upload
gsutil cp local-file.svg gs://skidspace-static-assets/category/
gsutil setmeta -h "Cache-Control:public, max-age=31536000" gs://skidspace-static-assets/category/file.svg
```

### Verify Assets
```bash
# List all assets
gsutil ls -la gs://skidspace-static-assets/

# Test URL accessibility
curl -I https://storage.googleapis.com/skidspace-static-assets/brand/logo-icon.svg
```

## Performance Benefits

1. **Global CDN**: Assets served from Google's edge locations worldwide
2. **Long Caching**: 1-year cache headers reduce repeat requests
3. **Optimized Delivery**: Compressed and properly typed content
4. **Scalability**: No server load for static asset delivery

## Monitoring

- **Console**: https://console.cloud.google.com/storage/browser/skidspace-static-assets
- **Usage**: Monitor bandwidth and request volume
- **Costs**: Minimal storage and egress costs

## Brand Asset URLs

All brand assets are publicly accessible:

- **Logo Icon**: https://storage.googleapis.com/skidspace-static-assets/brand/logo-icon.svg
- **Primary Logo**: https://storage.googleapis.com/skidspace-static-assets/brand/logo-primary.svg
- **Map Pin**: https://storage.googleapis.com/skidspace-static-assets/brand/map-pin.svg
- **Map Pin Active**: https://storage.googleapis.com/skidspace-static-assets/brand/map-pin-active.svg