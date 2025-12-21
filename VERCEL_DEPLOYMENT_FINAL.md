# 🚀 Deploy to Vercel - Complete Instructions

## Your app is ready for Vercel deployment!

### Option 1: Deploy via GitHub (Recommended - No CLI needed!)

1. **Push your code to GitHub:**

   ```bash
   git add .
   git commit -m "Ready for Vercel deployment"
   git push origin main
   ```

2. **Go to Vercel:**
   - Visit: https://vercel.com/new
   - Click "Import Git Repository"
   - Connect your GitHub account
   - Select your repository
   - Choose `/apps/web` as the root directory
   - Click "Deploy"

3. **Add Environment Variables in Vercel Dashboard:**
   ```
   DATABASE_URL=your-database-url
   NEXTAUTH_URL=https://your-project.vercel.app
   NEXTAUTH_SECRET=your-secret-key
   ```

### Option 2: Deploy via CLI

1. **Login to Vercel:**

   ```bash
   npx vercel login
   ```

2. **Deploy:**
   ```bash
   cd /Users/adebold/Documents/GitHub/warehouse-network/apps/web
   npx vercel --yes
   ```

### Quick Fixes Before Deployment:

If you get build errors, run:

```bash
# Install missing dependencies
npm install date-fns bcryptjs --save

# Or fix imports (change bcryptjs to bcrypt)
find . -name "*.ts" -o -name "*.tsx" | xargs sed -i '' "s/'bcryptjs'/'bcrypt'/g"
```

### Free Database Options:

- **Vercel Postgres**: One-click in Vercel dashboard
- **Supabase**: https://supabase.com
- **Neon**: https://neon.tech
- **PlanetScale**: https://planetscale.com

### After Deployment:

```bash
# Push database schema
npx prisma db push

# Seed database (optional)
npx prisma db seed
```

## 🎉 Your app will be live at: https://[your-project].vercel.app

The entire deployment takes about 2-3 minutes!
