const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');
const validator = require('../validator');
const config = require('../config');
const reporter = require('../utils/reporter');

async function validate(options) {
  const spinner = ora('Loading configuration...').start();
  
  try {
    // Load configuration
    const configuration = await config.load(process.cwd());
    spinner.succeed('Configuration loaded');
    
    // Run validation
    spinner.start('Running validation checks...');
    const results = await validator.validate(process.cwd(), configuration);
    spinner.stop();
    
    // Output results
    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      reporter.displayResults(results);
    }
    
    // Save report
    const reportPath = path.join(process.cwd(), 'validation-report.json');
    await fs.writeJSON(reportPath, results, { spaces: 2 });
    console.log('\nDetailed report saved to:', chalk.cyan(reportPath));
    
    // Auto-fix if requested
    if (options.fix && results.fixable.length > 0) {
      console.log('\n' + chalk.yellow(`Found ${results.fixable.length} auto-fixable issues.`));
      const { default: fix } = require('./fix');
      await fix({ interactive: false });
    }
    
    // Exit with appropriate code
    const hasErrors = results.errors.length > 0;
    const hasWarnings = results.warnings.length > 0;
    
    if (hasErrors || (options.strict && hasWarnings)) {
      process.exit(1);
    }
    
    console.log('\n' + chalk.green('✓ Validation completed successfully!'));
    
  } catch (error) {
    spinner.fail('Validation failed: ' + error.message);
    console.error(chalk.red(error.stack));
    process.exit(1);
  }
}

module.exports = validate;