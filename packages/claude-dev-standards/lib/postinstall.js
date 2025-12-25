#!/usr/bin/env node

const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

async function postInstall() {
  // Skip if running in CI or during global install
  if (process.env.CI || process.env.npm_config_global) {
    return;
  }
  
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, '.claude-standards.json');
  
  console.log('\n' + chalk.bold.blue('Claude Dev Standards') + ' installed successfully!\n');
  
  // Check if config exists
  if (!await fs.exists(configPath)) {
    console.log(chalk.yellow('No configuration found.'));
    console.log('Run ' + chalk.cyan('npx claude-dev-standards init') + ' to set up your project.\n');
  } else {
    console.log(chalk.green('✓') + ' Configuration detected');
    console.log('Run ' + chalk.cyan('npx cds validate') + ' to check your project.\n');
  }
  
  // Show quick tips
  console.log(chalk.bold('Quick commands:'));
  console.log('  ' + chalk.cyan('npx cds init') + '     - Initialize standards');
  console.log('  ' + chalk.cyan('npx cds validate') + ' - Validate project');
  console.log('  ' + chalk.cyan('npx cds check all') + ' - Run all checks');
  console.log('  ' + chalk.cyan('npx cds fix') + '      - Auto-fix issues\n');
}

// Run postinstall
postInstall().catch(error => {
  console.error(chalk.red('Post-install failed:'), error);
  // Don't exit with error to not break npm install
});