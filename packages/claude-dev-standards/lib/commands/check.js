const chalk = require('chalk');
const ora = require('ora');
const validators = require('../validators');
const config = require('../config');
const reporter = require('../utils/reporter');
const { logger } = require('../../../../../../utils/logger');

const checkTypes = {
  mocks: 'Mock Usage Check',
  auth: 'Authentication Check',
  database: 'Database Configuration Check',
  logging: 'Logging Configuration Check',
  testing: 'Testing Setup Check',
  security: 'Security Check',
  all: 'All Checks'
};

async function check(type) {
  const spinner = ora(`Running ${checkTypes[type]}...`).start();
  
  try {
    // Load configuration
    const configuration = await config.load(process.cwd());
    
    let results;
    
    if (type === 'all') {
      // Run all checks
      results = await runAllChecks(configuration);
    } else {
      // Run specific check
      const validator = validators[type];
      if (!validator) {
        throw new Error(`Unknown check type: ${type}`);
      }
      
      const checkResult = await validator.check(process.cwd(), configuration);
      results = {
        type: type,
        passed: checkResult.passed,
        errors: checkResult.errors || [],
        warnings: checkResult.warnings || [],
        info: checkResult.info || []
      };
    }
    
    spinner.stop();
    
    // Display results
    displayCheckResults(type, results);
    
    // Exit with error if checks failed
    if (!results.passed || (Array.isArray(results) && results.some(r => !r.passed))) {
      process.exit(1);
    }
    
  } catch (error) {
    spinner.fail(`Check failed: ${error.message}`);
    logger.error(chalk.red(error.stack));
    process.exit(1);
  }
}

async function runAllChecks(configuration) {
  const results = [];
  
  for (const [checkType, checkName] of Object.entries(checkTypes)) {
    if (checkType === 'all') continue;
    
    const validator = validators[checkType];
    if (!validator) continue;
    
    try {
      const result = await validator.check(process.cwd(), configuration);
      results.push({
        type: checkType,
        name: checkName,
        ...result
      });
    } catch (error) {
      results.push({
        type: checkType,
        name: checkName,
        passed: false,
        errors: [`Check failed: ${error.message}`]
      });
    }
  }
  
  return results;
}

function displayCheckResults(type, results) {
  if (Array.isArray(results)) {
    // Multiple check results
    logger.info(chalk.bold('\nValidation Results:\n'));
    
    let totalErrors = 0;
    let totalWarnings = 0;
    
    results.forEach(result => {
      const status = result.passed ? chalk.green('✓') : chalk.red('✗');
      logger.info(`${status} ${result.name}`);
      
      if (result.errors && result.errors.length > 0) {
        totalErrors += result.errors.length;
        result.errors.forEach(error => {
          logger.info(`  ${chalk.red('●')} ${error}`);
        });
      }
      
      if (result.warnings && result.warnings.length > 0) {
        totalWarnings += result.warnings.length;
        result.warnings.forEach(warning => {
          logger.info(`  ${chalk.yellow('●')} ${warning}`);
        });
      }
      
      logger.info();
    });
    
    // Summary
    logger.info(chalk.bold('Summary:'));
    logger.info(`  Errors: ${totalErrors > 0 ? chalk.red(totalErrors) : chalk.green(0)}`);
    logger.info(`  Warnings: ${totalWarnings > 0 ? chalk.yellow(totalWarnings) : chalk.green(0)}`);
    
  } else {
    // Single check result
    const status = results.passed ? chalk.green('✓ PASSED') : chalk.red('✗ FAILED');
    logger.info(`\n${checkTypes[type]}: ${status}\n`);
    
    if (results.errors && results.errors.length > 0) {
      logger.info(chalk.red('Errors:'));
      results.errors.forEach(error => {
        logger.info(`  ${chalk.red('●')} ${error}`);
      });
      logger.info();
    }
    
    if (results.warnings && results.warnings.length > 0) {
      logger.info(chalk.yellow('Warnings:'));
      results.warnings.forEach(warning => {
        logger.info(`  ${chalk.yellow('●')} ${warning}`);
      });
      logger.info();
    }
    
    if (results.info && results.info.length > 0) {
      logger.info(chalk.blue('Info:'));
      results.info.forEach(info => {
        logger.info(`  ${chalk.blue('●')} ${info}`);
      });
    }
  }
}

module.exports = check;