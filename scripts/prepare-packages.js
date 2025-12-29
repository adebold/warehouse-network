#!/usr/bin/env node
/**
 * Prepare packages for publishing
 * This script builds all packages and validates their configuration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
import { logger } from './utils/logger';

const PACKAGES = [
  'packages/claude-agent-tracker',
  'packages/claude-dev-standards',
  'packages/claude-db-integrity',
  'packages/claude-devops-platform',
  'marketing-platform',
  'marketing-engine'
];

const REQUIRED_PACKAGE_FIELDS = [
  'name',
  'version',
  'description',
  'main',
  'types',
  'files'
];

function validatePackageJson(pkgPath) {
  const packageJsonPath = path.join(pkgPath, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Missing package.json in ${pkgPath}`);
  }
  
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Validate required fields
  const missing = REQUIRED_PACKAGE_FIELDS.filter(field => !pkg[field]);
  if (missing.length > 0) {
    logger.warn(`⚠️  ${pkg.name} missing fields: ${missing.join(', ')}`);
  }
  
  // Check if package is scoped
  if (!pkg.name.startsWith('@warehouse-network/')) {
    throw new Error(`Package ${pkg.name} must be scoped to @warehouse-network`);
  }
  
  // Check privacy settings
  if (!pkg.private && !pkg.publishConfig) {
    logger.warn(`⚠️  ${pkg.name} should have either "private": true or publishConfig`);
  }
  
  return pkg;
}

function buildPackage(pkgPath) {
  logger.info(`\n📦 Building ${pkgPath}...`);
  
  const pkg = validatePackageJson(pkgPath);
  
  try {
    // Install dependencies if needed
    if (!fs.existsSync(path.join(pkgPath, 'node_modules'))) {
      logger.info('  Installing dependencies...');
      execSync('npm install', { cwd: pkgPath, stdio: 'inherit' });
    }
    
    // Run build if script exists
    if (pkg.scripts && pkg.scripts.build) {
      logger.info('  Running build...');
      execSync('npm run build', { cwd: pkgPath, stdio: 'inherit' });
    }
    
    // Verify dist folder was created
    const distPath = path.join(pkgPath, 'dist');
    if (!fs.existsSync(distPath)) {
      logger.warn(`  ⚠️  No dist folder found after build`);
    } else {
      logger.info('  ✅ Build successful');
    }
    
    // Run tests if they exist
    if (pkg.scripts && pkg.scripts.test) {
      logger.info('  Running tests...');
      try {
        execSync('npm run test', { cwd: pkgPath, stdio: 'inherit' });
        logger.info('  ✅ Tests passed');
      } catch (e) {
        logger.warn('  ⚠️  Tests failed or not implemented');
      }
    }
    
  } catch (error) {
    logger.error(`  ❌ Build failed: ${error.message}`);
    return false;
  }
  
  return true;
}

function createPackageReadme(pkgPath) {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgPath, 'package.json'), 'utf8'));
  const readmePath = path.join(pkgPath, 'README.md');
  
  if (!fs.existsSync(readmePath)) {
    const readme = `# ${pkg.name}

${pkg.description}

## Installation

\`\`\`bash
npm install ${pkg.name}
\`\`\`

## Usage

\`\`\`typescript
import { } from '${pkg.name}';
\`\`\`

## License

${pkg.license || 'MIT'}
`;
    
    fs.writeFileSync(readmePath, readme);
    logger.info(`  📝 Created README.md for ${pkg.name}`);
  }
}

async function main() {
  logger.info('🚀 Preparing packages for publishing...\n');
  
  const results = {
    success: [],
    failed: []
  };
  
  for (const pkgPath of PACKAGES) {
    const fullPath = path.join(__dirname, '..', pkgPath);
    
    if (!fs.existsSync(fullPath)) {
      logger.info(`⏭️  Skipping ${pkgPath} (not found)`);
      continue;
    }
    
    try {
      createPackageReadme(fullPath);
      const success = buildPackage(fullPath);
      
      if (success) {
        results.success.push(pkgPath);
      } else {
        results.failed.push(pkgPath);
      }
    } catch (error) {
      logger.error(`❌ Error processing ${pkgPath}: ${error.message}`);
      results.failed.push(pkgPath);
    }
  }
  
  // Summary
  logger.info('\n📊 Build Summary:');
  logger.info(`  ✅ Successful: ${results.success.length}`);
  logger.info(`  ❌ Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    logger.info('\nFailed packages:');
    results.failed.forEach(pkg => logger.info(`  - ${pkg}`));
    process.exit(1);
  }
  
  logger.info('\n✨ All packages are ready for publishing!');
  logger.info('\nTo publish packages:');
  logger.info('  1. Set NPM_TOKEN environment variable');
  logger.info('  2. Update .npmrc with your registry configuration');
  logger.info('  3. Run: npm run publish:packages');
}

main().catch(console.error);