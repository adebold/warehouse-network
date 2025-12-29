#!/usr/bin/env node

const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const { logger } = require('../../../../../utils/logger');

async function postInstall() {
  // Skip if running in CI or during global install
  if (process.env.CI || process.env.npm_config_global) {
    return;
  }
  
  const projectRoot = process.cwd();
  const configPath = path.join(projectRoot, '.claude-standards.json');
  
  logger.info('\n' + chalk.bold.blue('Claude Dev Standards') + ' installed successfully!\n');
  
  // Check if config exists
  if (!await fs.exists(configPath)) {
    logger.info(chalk.yellow('No configuration found.'));
    logger.info('Run ' + chalk.cyan('npx claude-dev-standards init') + ' to set up your project.\n');
  } else {
    logger.info(chalk.green('✓') + ' Configuration detected');
    logger.info('Run ' + chalk.cyan('npx cds validate') + ' to check your project.\n');
  }
  
  // Show quick tips
  logger.info(chalk.bold('Quick commands:'));
  logger.info('  ' + chalk.cyan('npx cds init') + '     - Initialize standards');
  logger.info('  ' + chalk.cyan('npx cds validate') + ' - Validate project');
  logger.info('  ' + chalk.cyan('npx cds check all') + ' - Run all checks');
  logger.info('  ' + chalk.cyan('npx cds fix') + '      - Auto-fix issues\n');
}

// Run postinstall
postInstall().catch(error => {
  logger.error(chalk.red('Post-install failed:'), error);
  // Don't exit with error to not break npm install
});