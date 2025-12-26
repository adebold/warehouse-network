# 🚀 Deployment Guide - Warehouse Network with AI Assistant

This guide covers deploying the warehouse marketplace with the new AI assistant features.

## 🤖 New AI Features Included
- **Smart Search**: Natural language warehouse search ("I need 5,000 sqft near Chicago")
- **Lead Scoring**: Automatic 0-100 scoring for inquiries
- **Listing Wizard**: Step-by-step guide for warehouse owners
- **Pricing Calculator**: Market-based pricing recommendations
- **Chat Widget**: Floating AI assistant on homepage

## 📋 Pre-Deployment Checklist

### 1. Environment Variables
Create a `.env.production` file with:
```env
# Database (required)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Authentication (required)
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=generate-with-openssl-rand-hex-32

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_live_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret

# Optional but recommended
SENTRY_DSN=your-sentry-dsn
```

### 2. Database Setup
```bash
# Run migrations
cd packages/db
npx prisma migrate deploy
```

## 🚢 Deployment Options

### Option 1: Deploy to Google Cloud Run (Recommended)
```bash
# From the project root
cd apps/web

# Deploy with Google Cloud CLI
gcloud run deploy warehouse-frontend \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars-from-file=.env.production \
  --memory=1Gi \
  --cpu=2 \
  --max-instances=10 \
  --project your-project-id
```

### Option 2: Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Follow the prompts and add environment variables in Vercel dashboard
```

### Option 3: Deploy with Docker
```bash
# Build the image
docker build -t warehouse-network:latest apps/web

# Run locally
docker run -p 3000:3000 --env-file .env.production warehouse-network:latest

# Push to registry
docker tag warehouse-network:latest your-registry/warehouse-network:latest
docker push your-registry/warehouse-network:latest
```

### Option 4: Deploy to any Node.js host
```bash
# Build the application
cd apps/web
npm run build

# Upload these files to your host:
# - .next/
# - public/
# - package.json
# - next.config.js
# - node_modules/

# On the server, run:
npm start
```

## 🔍 Post-Deployment Verification

### 1. Test AI Assistant
- Visit homepage - chat widget should appear in bottom right
- Try: "Show me warehouses in Chicago"
- Click "List Your Space" - should start listing wizard

### 2. Check API Endpoints
```bash
# Test chat endpoint
curl -X POST https://your-domain.com/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'

# Test lead scoring
curl -X POST https://your-domain.com/api/ai/score-lead \
  -H "Content-Type: application/json" \
  -d '{"message": "I urgently need 10,000 sqft by next week", "userId": "test"}'
```

### 3. Monitor Performance
- Check response times for AI endpoints
- Verify rate limiting is working (10 requests/hour for anonymous users)
- Monitor database queries for new AI tables (Lead, AIInteraction, SearchHistory)

## 🛠️ Troubleshooting

### Issue: AI Chat not appearing
- Check browser console for errors
- Verify framer-motion is installed: `npm ls framer-motion`
- Check that AIChat component is imported in index.tsx

### Issue: Database errors
- Run migrations: `npx prisma migrate deploy`
- Check DATABASE_URL is correct
- Verify new tables exist: Lead, AIInteraction, SearchHistory, Notification

### Issue: Build failures
- Clear caches: `rm -rf .next`
- Reinstall dependencies: `npm ci`
- Check TypeScript errors: `npm run typecheck`

## 📊 Monitoring AI Features

### Key Metrics to Track
1. **AI Usage**: Track AIInteraction records
2. **Lead Quality**: Monitor Lead scores distribution
3. **Search Patterns**: Analyze SearchHistory
4. **Conversion**: Track leads → customers

### Database Queries for Analytics
```sql
-- Daily AI interactions
SELECT DATE(timestamp), COUNT(*) 
FROM "AIInteraction" 
GROUP BY DATE(timestamp);

-- Average lead score by day
SELECT DATE("createdAt"), AVG(score) 
FROM "Lead" 
GROUP BY DATE("createdAt");

-- Popular search terms
SELECT query->>'location', COUNT(*) 
FROM "SearchHistory" 
GROUP BY query->>'location';
```

## 🎯 Quick Start Commands

```bash
# Complete deployment to Google Cloud Run
cd apps/web
npm run build
gcloud run deploy warehouse-frontend --source . --region us-central1

# Check deployment status
gcloud run services describe warehouse-frontend --region us-central1

# View logs
gcloud run logs read --service warehouse-frontend --region us-central1
```

## 🔐 Security Considerations
- AI endpoints are rate-limited
- Lead data is associated with user IDs when available
- No sensitive data is stored in AI interactions
- All chat messages are logged for quality improvement

## 📞 Support
If you encounter issues:
1. Check the logs for error messages
2. Verify all environment variables are set
3. Ensure database migrations have run
4. Test API endpoints individually

The AI assistant is designed to work out-of-the-box once deployed. It will help users find warehouses, create listings, and generate leads automatically!