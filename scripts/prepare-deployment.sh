#!/bin/bash
# Deployment preparation script for warehouse-network with AI assistant

set -e

echo "🚀 Preparing warehouse-network for deployment..."

# 1. Check Node.js version
echo "📦 Checking Node.js version..."
node_version=$(node -v)
echo "Node.js version: $node_version"

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 3. Generate Prisma client
echo "🔧 Generating Prisma client..."
cd packages/db
npx prisma generate
cd ../..

# 4. Build packages
echo "🔨 Building packages..."
npm run build:packages || true

# 5. Build the web application
echo "🔨 Building web application..."
cd apps/web
npm run build

# 6. Create deployment info
echo "📝 Creating deployment info..."
cat > DEPLOYMENT_INFO.md << EOF
# Deployment Information

## AI Assistant Features Included
- Natural language warehouse search
- Lead scoring system (0-100)
- Listing creation wizard
- Pricing calculator
- Rate-limited API endpoints

## Environment Variables Required
- DATABASE_URL: PostgreSQL connection string
- NEXTAUTH_SECRET: Session secret (generate with: openssl rand -hex 32)
- NEXTAUTH_URL: Your production URL

## Deployment Steps

### Option 1: Deploy to Google Cloud Run
\`\`\`bash
cd apps/web
gcloud run deploy warehouse-frontend \\
  --source . \\
  --region us-central1 \\
  --allow-unauthenticated \\
  --set-env-vars="NODE_ENV=production" \\
  --project your-project-id
\`\`\`

### Option 2: Deploy to Vercel
1. Install Vercel CLI: \`npm i -g vercel\`
2. Run: \`vercel --prod\`
3. Follow the prompts

### Option 3: Deploy to any Node.js host
1. Upload the built application
2. Set environment variables
3. Run: \`npm start\`

## Post-Deployment Checklist
- [ ] Verify AI chat widget appears on homepage
- [ ] Test warehouse search functionality
- [ ] Check API rate limiting is working
- [ ] Verify database connections
- [ ] Test lead submission and scoring

## AI Assistant Endpoints
- POST /api/ai/chat - Main chat endpoint
- POST /api/ai/score-lead - Lead scoring endpoint

## Database Migrations
Run in production:
\`\`\`bash
cd packages/db
npx prisma migrate deploy
\`\`\`

EOF

echo "✅ Deployment preparation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Review DEPLOYMENT_INFO.md"
echo "2. Set production environment variables"
echo "3. Deploy using your preferred method"
echo ""
echo "🤖 AI Assistant is ready to help your warehouse marketplace!"