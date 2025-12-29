#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
console.log('🤖 Running AI-Enhanced Quick Quality Check...\n');

const results = {
  timestamp: new Date().toISOString(),
  checks: []
};

// Check 1: TypeScript
console.log('📘 Checking TypeScript...');
try {
  execSync('npm run type-check', { stdio: 'pipe' });
  results.checks.push({ name: 'TypeScript', status: 'PASS', issues: 0 });
  console.log('✅ TypeScript check passed\n');
} catch (error) {
  const errorCount = (error.stdout?.toString().match(/error TS/g) || []).length;
  results.checks.push({ name: 'TypeScript', status: 'FAIL', issues: errorCount });
  console.log(`❌ TypeScript check failed with ${errorCount} errors\n`);
}

// Check 2: ESLint
console.log('🔍 Running ESLint...');
try {
  execSync('npm run lint', { stdio: 'pipe' });
  results.checks.push({ name: 'ESLint', status: 'PASS', issues: 0 });
  console.log('✅ ESLint check passed\n');
} catch (error) {
  results.checks.push({ name: 'ESLint', status: 'FAIL', issues: 1 });
  console.log('❌ ESLint check failed\n');
}

// Check 3: Package.json validation
console.log('📦 Validating package.json...');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
if (packageJson.claudeAiPlatformDependencies) {
  console.log('✅ AI Platform dependencies configured');
  results.checks.push({ 
    name: 'AI Platform Integration', 
    status: 'PASS', 
    dependencies: Object.keys(packageJson.claudeAiPlatformDependencies).length 
  });
} else {
  console.log('❌ AI Platform dependencies not found');
  results.checks.push({ name: 'AI Platform Integration', status: 'FAIL' });
}

// Check 4: Quality gates
console.log('\n🚦 Checking quality gates...');
if (fs.existsSync('.ai-quality-gates.json')) {
  const gates = JSON.parse(fs.readFileSync('.ai-quality-gates.json', 'utf-8'));
  console.log('✅ Quality gates configured');
  console.log(`  - Pre-commit: ${gates.gates['pre-commit']?.enabled ? 'Enabled' : 'Disabled'}`);
  console.log(`  - Pre-push: ${gates.gates['pre-push']?.enabled ? 'Enabled' : 'Disabled'}`);
  console.log(`  - CI Pipeline: ${gates.gates['ci-pipeline']?.enabled ? 'Enabled' : 'Disabled'}`);
  results.checks.push({ name: 'Quality Gates', status: 'PASS' });
} else {
  console.log('❌ Quality gates not configured');
  results.checks.push({ name: 'Quality Gates', status: 'FAIL' });
}

// Check 5: Pre-commit hooks
console.log('\n🪝 Checking pre-commit hooks...');
if (fs.existsSync('.husky/pre-commit')) {
  console.log('✅ Pre-commit hooks configured');
  results.checks.push({ name: 'Pre-commit Hooks', status: 'PASS' });
} else {
  console.log('❌ Pre-commit hooks not configured');
  results.checks.push({ name: 'Pre-commit Hooks', status: 'FAIL' });
}

// Generate summary
console.log('\n' + '='.repeat(50));
console.log('📊 QUALITY CHECK SUMMARY');
console.log('='.repeat(50));

const passed = results.checks.filter(c => c.status === 'PASS').length;
const failed = results.checks.filter(c => c.status === 'FAIL').length;
const score = Math.round((passed / results.checks.length) * 100);

console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Score: ${score}%`);

// Save results
fs.writeFileSync(
  'ai-quality-check-results.json',
  JSON.stringify(results, null, 2)
);

console.log('\n💾 Results saved to ai-quality-check-results.json');

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);