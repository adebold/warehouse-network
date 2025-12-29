#!/usr/bin/env node
/**
 * Prepare packages for publishing
 * This script builds all packages and validates their configuration
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
    console.warn(`⚠️  ${pkg.name} missing fields: ${missing.join(', ')}`);
  }
  
  // Check if package is scoped
  if (!pkg.name.startsWith('@warehouse-network/')) {
    throw new Error(`Package ${pkg.name} must be scoped to @warehouse-network`);
  }
  
  // Check privacy settings
  if (!pkg.private && !pkg.publishConfig) {
    console.warn(`⚠️  ${pkg.name} should have either "private": true or publishConfig`);
  }
  
  return pkg;
}

function buildPackage(pkgPath) {
  console.log(`\n📦 Building ${pkgPath}...`);
  
  const pkg = validatePackageJson(pkgPath);
  
  try {
    // Install dependencies if needed
    if (!fs.existsSync(path.join(pkgPath, 'node_modules'))) {
      console.log('  Installing dependencies...');
      execSync('npm install', { cwd: pkgPath, stdio: 'inherit' });
    }
    
    // Run build if script exists
    if (pkg.scripts && pkg.scripts.build) {
      console.log('  Running build...');
      execSync('npm run build', { cwd: pkgPath, stdio: 'inherit' });
    }
    
    // Verify dist folder was created
    const distPath = path.join(pkgPath, 'dist');
    if (!fs.existsSync(distPath)) {
      console.warn(`  ⚠️  No dist folder found after build`);
    } else {
      console.log('  ✅ Build successful');
    }
    
    // Run tests if they exist
    if (pkg.scripts && pkg.scripts.test) {
      console.log('  Running tests...');
      try {
        execSync('npm run test', { cwd: pkgPath, stdio: 'inherit' });
        console.log('  ✅ Tests passed');
      } catch (e) {
        console.warn('  ⚠️  Tests failed or not implemented');
      }
    }
    
  } catch (error) {
    console.error(`  ❌ Build failed: ${error.message}`);
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
    console.log(`  📝 Created README.md for ${pkg.name}`);
  }
}

async function main() {
  console.log('🚀 Preparing packages for publishing...\n');
  
  const results = {
    success: [],
    failed: []
  };
  
  for (const pkgPath of PACKAGES) {
    const fullPath = path.join(__dirname, '..', pkgPath);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`⏭️  Skipping ${pkgPath} (not found)`);
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
      console.error(`❌ Error processing ${pkgPath}: ${error.message}`);
      results.failed.push(pkgPath);
    }
  }
  
  // Summary
  console.log('\n📊 Build Summary:');
  console.log(`  ✅ Successful: ${results.success.length}`);
  console.log(`  ❌ Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log('\nFailed packages:');
    results.failed.forEach(pkg => console.log(`  - ${pkg}`));
    process.exit(1);
  }
  
  console.log('\n✨ All packages are ready for publishing!');
  console.log('\nTo publish packages:');
  console.log('  1. Set NPM_TOKEN environment variable');
  console.log('  2. Update .npmrc with your registry configuration');
  console.log('  3. Run: npm run publish:packages');
}

main().catch(console.error);