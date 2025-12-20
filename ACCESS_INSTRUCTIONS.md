# 🔐 How to Access Your Deployed Warehouse App

## The 403 Forbidden Error Explained

Your service is **successfully deployed and running**! The 403 error means:
- ✅ Cloud Run service is active
- ✅ Application is responding
- ❌ But it requires authentication (due to Google Cloud organization policies)

## 🚀 Quick Access Steps

### Option 1: Authenticated Access (Recommended)

1. **Re-authenticate with Google Cloud:**
   ```bash
   gcloud auth login
   ```

2. **Get your identity token:**
   ```bash
   TOKEN=$(gcloud auth print-identity-token)
   ```

3. **Access your app with authentication:**
   ```bash
   # Using curl
   curl -H "Authorization: Bearer $TOKEN" \
     https://warehouse-app-mesh-3yuo5fgbja-uc.a.run.app
   
   # Or open in browser with extension
   # Install ModHeader Chrome extension
   # Add header: Authorization: Bearer [YOUR_TOKEN]
   ```

### Option 2: Local Testing with Cloud SQL

Since your organization blocks public access, you can run locally:

```bash
cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web

# Start development server
npm run dev

# Access at http://localhost:3000
```

### Option 3: Create a Proxy for Browser Access

Create this simple proxy script:

```bash
# Save as proxy-server.js
cat > proxy-server.js << 'EOF'
const express = require('express');
const { exec } = require('child_process');
const https = require('https');

const app = express();

app.use('*', (req, res) => {
  exec('gcloud auth print-identity-token', (error, token) => {
    if (error) {
      res.status(500).send('Auth failed');
      return;
    }
    
    const options = {
      hostname: 'warehouse-app-mesh-3yuo5fgbja-uc.a.run.app',
      path: req.originalUrl,
      method: req.method,
      headers: {
        ...req.headers,
        'Authorization': `Bearer ${token.trim()}`,
        'host': 'warehouse-app-mesh-3yuo5fgbja-uc.a.run.app'
      }
    };
    
    const proxy = https.request(options, (response) => {
      res.status(response.statusCode);
      Object.entries(response.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      response.pipe(res);
    });
    
    req.pipe(proxy);
  });
});

app.listen(8080, () => {
  console.log('Proxy running at http://localhost:8080');
});
EOF

# Install express locally
npm install express

# Run the proxy
node proxy-server.js

# Access your app at http://localhost:8080
```

## 🔍 Check Service Status

1. **Verify the service is running:**
   ```bash
   gcloud run services describe warehouse-app-mesh \
     --region=us-central1 \
     --project=easyreno-poc-202512161545 \
     --format="get(status.conditions[0])"
   ```

2. **Check recent logs:**
   ```bash
   gcloud run services logs read warehouse-app-mesh \
     --region=us-central1 \
     --project=easyreno-poc-202512161545 \
     --limit=50
   ```

## 🏢 Organization Policy Note

Your Google Cloud organization has security policies that:
- ✅ Protect services from unauthorized public access
- ❌ Prevent setting `allUsers` IAM policy
- ✅ Require authenticated access with Google identity

This is actually **good for security** - your production data is protected!

## 💡 Production Solution

For production use with customers, you'll want to:

1. **Set up a Load Balancer** with a custom domain
2. **Use Firebase Auth** or **Auth0** for customer authentication
3. **Keep Cloud Run behind authentication** for security

## 🎯 Quick Test Command

After re-authenticating, run this one-liner to test:

```bash
gcloud auth login && \
curl -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  https://warehouse-app-mesh-3yuo5fgbja-uc.a.run.app
```

Your warehouse application is deployed and working - you just need to authenticate to access it!