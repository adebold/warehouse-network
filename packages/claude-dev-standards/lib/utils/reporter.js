const chalk = require('chalk');
const Table = require('cli-table3');

function displayResults(results) {
  console.log('\n' + chalk.bold('Claude Dev Standards Validation Report'));
  console.log('=' .repeat(50) + '\n');
  
  // Summary
  const status = results.passed ? chalk.green('PASSED') : chalk.red('FAILED');
  console.log(`Status: ${status}`);
  console.log(`Errors: ${results.errors.length > 0 ? chalk.red(results.errors.length) : chalk.green('0')}`);
  console.log(`Warnings: ${results.warnings.length > 0 ? chalk.yellow(results.warnings.length) : chalk.green('0')}`);
  console.log(`Info: ${chalk.blue(results.info.length)}`);
  
  if (results.fixable && results.fixable.length > 0) {
    console.log(`Auto-fixable: ${chalk.cyan(results.fixable.length)}`);
  }
  
  // Check summary table
  if (results.summary && Object.keys(results.summary).length > 0) {
    console.log('\n' + chalk.bold('Check Summary:'));
    
    const table = new Table({
      head: ['Check', 'Status', 'Errors', 'Warnings'],
      style: { head: ['cyan'] }
    });
    
    Object.entries(results.summary).forEach(([check, summary]) => {
      table.push([
        check,
        summary.passed ? chalk.green('✓') : chalk.red('✗'),
        summary.errors > 0 ? chalk.red(summary.errors) : '0',
        summary.warnings > 0 ? chalk.yellow(summary.warnings) : '0'
      ]);
    });
    
    console.log(table.toString());
  }
  
  // Errors
  if (results.errors.length > 0) {
    console.log('\n' + chalk.red.bold('Errors:'));
    results.errors.forEach((error, index) => {
      console.log(`${chalk.red(`${index + 1}.`)} ${error}`);
    });
  }
  
  // Warnings
  if (results.warnings.length > 0) {
    console.log('\n' + chalk.yellow.bold('Warnings:'));
    results.warnings.forEach((warning, index) => {
      console.log(`${chalk.yellow(`${index + 1}.`)} ${warning}`);
    });
  }
  
  // Info
  if (results.info.length > 0) {
    console.log('\n' + chalk.blue.bold('Information:'));
    results.info.forEach((info) => {
      console.log(`${chalk.blue('•')} ${info}`);
    });
  }
  
  // Auto-fixable issues
  if (results.fixable && results.fixable.length > 0) {
    console.log('\n' + chalk.cyan.bold('Auto-fixable Issues:'));
    console.log('Run ' + chalk.cyan('npx cds fix') + ' to automatically fix these issues:');
    
    const fixableByType = {};
    results.fixable.forEach(issue => {
      if (!fixableByType[issue.type]) {
        fixableByType[issue.type] = 0;
      }
      fixableByType[issue.type]++;
    });
    
    Object.entries(fixableByType).forEach(([type, count]) => {
      console.log(`${chalk.cyan('•')} ${type}: ${count} issue(s)`);
    });
  }
  
  console.log('\n' + '='.repeat(50));
}

module.exports = {
  displayResults
};