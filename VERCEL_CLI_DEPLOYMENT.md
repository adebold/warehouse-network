# 🚀 Vercel CLI Deployment Guide

## Current Status

Your code is pushed to GitHub and ready for deployment. However, Vercel CLI requires authentication.

## Authentication Required

### Option 1: Interactive Login (Recommended)

```bash
# 1. Login to Vercel
npx vercel login

# 2. Follow the prompts:
#    - Press Enter to open browser
#    - Or visit the URL shown
#    - Confirm in browser

# 3. Deploy
cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web
npx vercel --yes
```

### Option 2: Token-Based Deployment

```bash
# 1. Get a token from:
https://vercel.com/account/tokens

# 2. Deploy with token
cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web
VERCEL_TOKEN=your-token-here npx vercel --yes --token=your-token-here
```

## Deployment Command (After Login)

```bash
npx vercel --yes \
  --name warehouse-network \
  --build-env DATABASE_URL="postgresql://temporary/database" \
  --build-env NEXTAUTH_URL="https://warehouse-network.vercel.app" \
  --build-env NEXTAUTH_SECRET="temporary-secret" \
  --env DATABASE_URL="postgresql://temporary/database" \
  --env NEXTAUTH_URL="https://warehouse-network.vercel.app" \
  --env NEXTAUTH_SECRET="temporary-secret"
```

## Post-Deployment Steps

1. **Update Environment Variables**

   ```bash
   # Pull down environment file
   vercel env pull .env.local

   # Edit with real values
   # Then push back
   vercel env add DATABASE_URL production < .env.local
   ```

2. **Connect Database**

   ```bash
   # Use Vercel Postgres
   vercel link
   vercel env pull
   ```

3. **Deploy to Production**
   ```bash
   vercel --prod
   ```

## Quick Scripts Created

- `vercel-deploy.sh` - Full deployment with checks
- `deploy-now.sh` - Quick deployment helper

## Environment Variables Needed

```env
DATABASE_URL=your-database-connection
NEXTAUTH_URL=https://warehouse-network.vercel.app
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
```

## Generate NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

Your app is ready to deploy as soon as you complete authentication!
