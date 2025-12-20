# 🚀 Vercel Deployment Guide

## Prerequisites Completed ✅
- Vercel CLI installed globally
- Environment variables configured
- vercel.json created

## Step 1: Deploy to Vercel

Run this command from the apps/web directory:

```bash
cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web
vercel
```

### First-time deployment prompts:
1. **Set up and deploy?** → Yes
2. **Which scope?** → Select your account or create one
3. **Link to existing project?** → No (create new)
4. **Project name?** → warehouse-network (or your preferred name)
5. **Directory?** → ./ (current directory)
6. **Override settings?** → No

## Step 2: Set Environment Variables

After deployment, you'll need to add environment variables in the Vercel dashboard:

1. Go to your project at https://vercel.com/dashboard
2. Navigate to Settings → Environment Variables
3. Add these required variables:

```env
DATABASE_URL=your-database-connection-string
NEXTAUTH_SECRET=generate-secure-secret-with-openssl-rand-base64-32
NEXTAUTH_URL=https://your-project.vercel.app
```

### Generate NEXTAUTH_SECRET:
```bash
openssl rand -base64 32
```

## Step 3: Database Options

### Option A: Use Vercel Postgres (Recommended)
1. Go to Storage tab in Vercel dashboard
2. Create a new Postgres database
3. It will automatically set DATABASE_URL

### Option B: Use External Database
- Supabase: https://supabase.com (free tier available)
- Neon: https://neon.tech (serverless Postgres)
- PlanetScale: https://planetscale.com (MySQL)

## Step 4: Redeploy with Environment Variables

After adding environment variables:

```bash
vercel --prod
```

## Step 5: Set up Prisma Migrations

Once database is connected:

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Optional: Seed database
npx prisma db seed
```

## Useful Vercel Commands

```bash
# Deploy to production
vercel --prod

# Deploy to preview
vercel

# View logs
vercel logs

# List deployments
vercel ls

# Remove deployment
vercel rm [deployment-url]
```

## Custom Domain (Optional)

1. Go to Settings → Domains in Vercel dashboard
2. Add your domain (e.g., warehouse.yourdomain.com)
3. Follow DNS configuration instructions

## Troubleshooting

If deployment fails:
1. Check build logs in Vercel dashboard
2. Ensure all dependencies are in package.json
3. Verify environment variables are set
4. Check Prisma schema is valid

## Next Steps

1. Monitor your deployment at https://vercel.com/dashboard
2. Set up GitHub integration for automatic deployments
3. Configure preview deployments for pull requests
4. Add monitoring with Vercel Analytics

Your app will be live at: https://[project-name].vercel.app