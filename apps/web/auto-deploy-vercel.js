#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { logger } = require('./utils/logger');

logger.info('🚀 Automated Vercel Deployment Helper\n');

// Check if we can build the project
logger.info('📦 Testing build...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  logger.info('✅ Build successful!\n');
} catch (error) {
  logger.error('❌ Build failed. Please fix errors before deploying.\n');
  process.exit(1);
}

// Create a deployment guide
const deploymentSteps = `
# 🎯 Quick Vercel Deployment

Your app is ready! To deploy:

## Option 1: Browser (Easiest - 2 minutes)
1. Go to: https://vercel.com/new
2. Import your GitHub repository
3. It will auto-detect Next.js and deploy!

## Option 2: CLI with Login
\`\`\`bash
npx vercel login
npx vercel --yes
\`\`\`

## Option 3: CLI with Token
1. Get token from: https://vercel.com/account/tokens
2. Run:
\`\`\`bash
VERCEL_TOKEN=your-token npx vercel --yes --token=your-token
\`\`\`

## Environment Variables to Add:
- DATABASE_URL
- NEXTAUTH_URL (will be https://your-app.vercel.app)
- NEXTAUTH_SECRET (generate with: openssl rand -base64 32)
`;

fs.writeFileSync('VERCEL_DEPLOY_NOW.md', deploymentSteps);
logger.info('📝 Created VERCEL_DEPLOY_NOW.md with instructions\n');

// Show immediate action
logger.info('🎯 Immediate Action:');
logger.info('-------------------');
logger.info('Run this command to start deployment:');
logger.info('\n  npx vercel login && npx vercel --yes\n');
logger.info('Or visit: https://vercel.com/new to deploy via browser\n');
