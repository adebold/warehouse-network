# 🚀 Import to Vercel - Step by Step

## ✅ Prerequisites Complete!

- Code pushed to GitHub: `feat/docker-setup` branch
- Dependencies fixed (bcryptjs, date-fns added)
- Vercel configuration ready

## 📋 Import Steps:

### 1. Go to Vercel Import Page

👉 **Click here:** https://vercel.com/new

### 2. Import Your Repository

1. Click **"Import Git Repository"**
2. If not connected, click **"Add GitHub Account"** and authorize Vercel
3. Search for: **"warehouse-network"**
4. Click **"Import"** next to your repository

### 3. Configure Your Project

When the configuration screen appears:

**Project Name:** `warehouse-network` (or your preferred name)

**Framework Preset:** Next.js (auto-detected)

**Root Directory:** Click "Edit" and enter:

```
apps/web
```

**Build & Output Settings:** (Leave defaults)

- Build Command: `npm run build` or `next build`
- Output Directory: `.next`
- Install Command: `npm install`

### 4. Environment Variables

Click **"Add"** for each variable:

```env
DATABASE_URL=postgresql://user:pass@host:5432/warehouse_network
NEXTAUTH_URL=https://warehouse-network.vercel.app
NEXTAUTH_SECRET=generate-this-with-command-below
```

**To generate NEXTAUTH_SECRET:**

```bash
openssl rand -base64 32
```

### 5. Deploy!

Click **"Deploy"** and wait 2-3 minutes

## 🎯 After Deployment:

### Get Your Database (Free Options):

1. **Vercel Postgres** (Easiest)
   - Go to Storage tab in Vercel
   - Click "Create Database"
   - Select "Postgres"
   - It auto-sets DATABASE_URL!

2. **Supabase** (Alternative)
   - Visit: https://supabase.com
   - Create free project
   - Copy connection string

### Push Database Schema:

```bash
# After adding DATABASE_URL
vercel env pull .env.local
npx prisma db push
npx prisma db seed  # Optional: add test data
```

## 🌐 Your Live URLs:

- Production: `https://warehouse-network.vercel.app`
- Preview: `https://warehouse-network-git-feat-docker-setup.vercel.app`

## 📱 What Happens Next:

1. Vercel builds your app automatically
2. Every push to GitHub triggers a new deployment
3. Pull requests get preview deployments
4. Main/master branch deploys to production

## 🔧 Troubleshooting:

- **Build fails?** Check build logs in Vercel dashboard
- **Database errors?** Ensure DATABASE_URL is set correctly
- **Auth not working?** Verify NEXTAUTH_URL matches your deployment URL

## 🎉 Success!

Your warehouse network app will be live in minutes!
