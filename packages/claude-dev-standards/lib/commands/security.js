// Security command for Claude Dev Standards CLI
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const SecurityValidator = require('../validators/security');
const { logger } = require('../../../../../../utils/logger');

/**
 * Security setup and validation commands
 */
class SecurityCommand {
  constructor(program) {
    this.program = program;
    this.setupCommands();
  }

  setupCommands() {
    // Main security command
    const securityCmd = this.program
      .command('security')
      .description('Security framework setup and validation');

    // Security validation
    securityCmd
      .command('check')
      .description('Run comprehensive security validation')
      .option('--strict', 'Enable strict validation mode')
      .option('--format <format>', 'Output format (table, json, detailed)', 'table')
      .action(async (options) => {
        await this.runSecurityCheck(options);
      });

    // Security setup
    securityCmd
      .command('setup')
      .description('Setup comprehensive security framework')
      .option('--auth', 'Setup authentication framework', true)
      .option('--secrets', 'Setup secrets management', true)
      .option('--rbac', 'Setup role-based access control', true)
      .option('--audit', 'Setup audit logging', true)
      .option('--container', 'Setup container security', true)
      .option('--interactive', 'Interactive setup mode', false)
      .action(async (options) => {
        await this.runSecuritySetup(options);
      });

    // Security report
    securityCmd
      .command('report')
      .description('Generate comprehensive security report')
      .option('--output <file>', 'Output file for report')
      .option('--format <format>', 'Report format (html, json, pdf)', 'html')
      .action(async (options) => {
        await this.generateSecurityReport(options);
      });

    // Security scan
    securityCmd
      .command('scan')
      .description('Scan for security vulnerabilities')
      .option('--dependencies', 'Scan dependencies for vulnerabilities', true)
      .option('--code', 'Scan code for security issues', true)
      .option('--containers', 'Scan container images', true)
      .action(async (options) => {
        await this.runSecurityScan(options);
      });
  }

  /**
   * Run comprehensive security validation
   */
  async runSecurityCheck(options) {
    const spinner = ora('Running security validation...').start();
    
    try {
      const projectPath = process.cwd();
      const security = new SecurityValidator({ strict: options.strict });
      
      const results = await security.validate(projectPath);
      spinner.stop();

      this.displayResults(results, options.format);
      
      if (results.score < 70) {
        logger.info(chalk.red('\n⚠️  Security score is below 70%. Consider running setup to improve security.'));
        logger.info(chalk.yellow('Run: claude-dev-standards security setup'));
      } else if (results.score < 90) {
        logger.info(chalk.yellow('\n✨ Good security posture! Consider addressing warnings for better security.'));
      } else {
        logger.info(chalk.green('\n🔒 Excellent security posture!'));
      }

    } catch (error) {
      spinner.fail('Security validation failed');
      logger.error(chalk.red(error.message));
      process.exit(1);
    }
  }

  /**
   * Run security framework setup
   */
  async runSecuritySetup(options) {
    logger.info(chalk.blue('🔒 Claude Security Framework Setup\n'));
    
    let setupOptions = { ...options };

    if (options.interactive) {
      setupOptions = await this.interactiveSetup();
    }

    const spinner = ora('Setting up security framework...').start();
    
    try {
      const projectPath = process.cwd();
      const security = new SecurityValidator();
      
      const results = await security.setupSecurity(projectPath, setupOptions);
      spinner.stop();

      logger.info(chalk.green('\n✅ Security framework setup completed!\n'));
      
      results.forEach(result => {
        logger.info(chalk.green(`✓ ${result.component} - ${result.status}`));
        if (result.path) {
          logger.info(chalk.gray(`  → ${result.path}`));
        }
      });

      logger.info(chalk.blue('\n📖 Next steps:'));
      logger.info('1. Review generated configuration files');
      logger.info('2. Update environment variables');
      logger.info('3. Run: claude-dev-standards security check');
      logger.info('4. Test your application with security features');

    } catch (error) {
      spinner.fail('Security setup failed');
      logger.error(chalk.red(error.message));
      process.exit(1);
    }
  }

  /**
   * Interactive setup mode
   */
  async interactiveSetup() {
    const questions = [
      {
        type: 'checkbox',
        name: 'components',
        message: 'Which security components would you like to setup?',
        choices: [
          { name: 'Authentication (JWT, OAuth)', value: 'auth', checked: true },
          { name: 'Secrets Management (Vault, encryption)', value: 'secrets', checked: true },
          { name: 'Role-Based Access Control (RBAC)', value: 'rbac', checked: true },
          { name: 'Audit Logging', value: 'audit', checked: true },
          { name: 'Container Security', value: 'container', checked: true }
        ]
      },
      {
        type: 'list',
        name: 'framework',
        message: 'What framework are you using?',
        choices: ['express', 'nextjs', 'nestjs', 'auto-detect'],
        default: 'auto-detect'
      },
      {
        type: 'confirm',
        name: 'strict',
        message: 'Enable strict security mode?',
        default: true
      },
      {
        type: 'confirm',
        name: 'compliance',
        message: 'Setup for GDPR compliance?',
        default: false
      }
    ];

    const answers = await inquirer.prompt(questions);
    
    return {
      auth: answers.components.includes('auth'),
      secrets: answers.components.includes('secrets'),
      rbac: answers.components.includes('rbac'),
      audit: answers.components.includes('audit'),
      container: answers.components.includes('container'),
      framework: answers.framework,
      strict: answers.strict,
      compliance: answers.compliance
    };
  }

  /**
   * Generate security report
   */
  async generateSecurityReport(options) {
    const spinner = ora('Generating security report...').start();
    
    try {
      const projectPath = process.cwd();
      const security = new SecurityValidator();
      
      const results = await security.validate(projectPath);
      
      const report = this.createSecurityReport(results);
      
      if (options.output) {
        const fs = require('fs-extra');
        await fs.writeFile(options.output, report);
        spinner.succeed(`Security report generated: ${options.output}`);
      } else {
        spinner.stop();
        logger.info(report);
      }

    } catch (error) {
      spinner.fail('Report generation failed');
      logger.error(chalk.red(error.message));
      process.exit(1);
    }
  }

  /**
   * Run security scan
   */
  async runSecurityScan(options) {
    logger.info(chalk.blue('🔍 Running Security Scans\n'));
    
    const tasks = [];
    
    if (options.dependencies) {
      tasks.push(this.scanDependencies());
    }
    
    if (options.code) {
      tasks.push(this.scanCode());
    }
    
    if (options.containers) {
      tasks.push(this.scanContainers());
    }

    try {
      await Promise.all(tasks);
      logger.info(chalk.green('\n✅ Security scans completed!'));
    } catch (error) {
      logger.error(chalk.red('\n❌ Security scan failed:', error.message));
      process.exit(1);
    }
  }

  /**
   * Scan dependencies for vulnerabilities
   */
  async scanDependencies() {
    const spinner = ora('Scanning dependencies...').start();
    
    try {
      const { execa } = require('execa');
      
      // Run npm audit
      try {
        await execa('npm', ['audit', '--audit-level', 'moderate']);
        spinner.succeed('Dependencies scan: No vulnerabilities found');
      } catch (error) {
        if (error.stdout && error.stdout.includes('vulnerabilities')) {
          spinner.warn('Dependencies scan: Vulnerabilities found');
          logger.info(chalk.yellow('\nRun: npm audit fix'));
        } else {
          spinner.fail('Dependencies scan failed');
        }
      }

    } catch (error) {
      spinner.fail('Dependencies scan failed');
    }
  }

  /**
   * Scan code for security issues
   */
  async scanCode() {
    const spinner = ora('Scanning code...').start();
    
    try {
      const security = new SecurityValidator();
      const results = await security.validate(process.cwd());
      
      const criticalIssues = results.failed.filter(issue => 
        issue.includes('❌') && 
        (issue.includes('authentication') || issue.includes('injection') || issue.includes('hardcoded'))
      );

      if (criticalIssues.length === 0) {
        spinner.succeed('Code scan: No critical security issues found');
      } else {
        spinner.warn(`Code scan: ${criticalIssues.length} critical issues found`);
        criticalIssues.forEach(issue => {
          logger.info(chalk.red(`  ${issue}`));
        });
      }

    } catch (error) {
      spinner.fail('Code scan failed');
    }
  }

  /**
   * Scan container images
   */
  async scanContainers() {
    const spinner = ora('Scanning containers...').start();
    
    try {
      const fs = require('fs-extra');
      
      if (!fs.existsSync('Dockerfile')) {
        spinner.info('Container scan: No Dockerfile found');
        return;
      }

      // Check if trivy is available
      try {
        const { execa } = require('execa');
        await execa('trivy', ['--version']);
        
        // Run trivy scan
        await execa('trivy', ['fs', '--security-checks', 'vuln', '.']);
        spinner.succeed('Container scan: Completed with Trivy');
        
      } catch (error) {
        spinner.warn('Container scan: Trivy not available');
        logger.info(chalk.yellow('Install Trivy for container vulnerability scanning'));
      }

    } catch (error) {
      spinner.fail('Container scan failed');
    }
  }

  /**
   * Display validation results
   */
  displayResults(results, format) {
    if (format === 'json') {
      logger.info(JSON.stringify(results, null, 2));
      return;
    }

    const Table = require('cli-table3');
    
    // Security score
    const scoreColor = results.score >= 90 ? 'green' : results.score >= 70 ? 'yellow' : 'red';
    logger.info(chalk[scoreColor](`\n🔒 Security Score: ${results.score.toFixed(1)}/100\n`));

    // Passed checks
    if (results.passed.length > 0) {
      logger.info(chalk.green('✅ Passed Security Checks:'));
      results.passed.forEach(check => logger.info(`  ${check}`));
      logger.info();
    }

    // Failed checks
    if (results.failed.length > 0) {
      logger.info(chalk.red('❌ Failed Security Checks:'));
      results.failed.forEach(check => logger.info(`  ${check}`));
      logger.info();
    }

    // Warnings
    if (results.warnings.length > 0) {
      logger.info(chalk.yellow('⚠️  Security Warnings:'));
      results.warnings.forEach(warning => logger.info(`  ${warning}`));
      logger.info();
    }

    // Summary table
    const summaryTable = new Table({
      head: ['Category', 'Status', 'Count'],
      style: { head: ['cyan'] }
    });

    summaryTable.push(
      [chalk.green('Passed'), '✅', results.passed.length],
      [chalk.red('Failed'), '❌', results.failed.length],
      [chalk.yellow('Warnings'), '⚠️ ', results.warnings.length]
    );

    logger.info(summaryTable.toString());
  }

  /**
   * Create security report
   */
  createSecurityReport(results) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        score: results.score,
        total_checks: results.maxScore,
        passed: results.passed.length,
        failed: results.failed.length,
        warnings: results.warnings.length
      },
      details: {
        passed: results.passed,
        failed: results.failed,
        warnings: results.warnings
      },
      recommendations: this.generateRecommendations(results)
    };

    return JSON.stringify(report, null, 2);
  }

  /**
   * Generate security recommendations
   */
  generateRecommendations(results) {
    const recommendations = [];

    if (results.failed.some(f => f.includes('authentication'))) {
      recommendations.push({
        priority: 'critical',
        category: 'authentication',
        action: 'Implement JWT-based authentication with secure password hashing',
        command: 'claude-dev-standards security setup --auth'
      });
    }

    if (results.failed.some(f => f.includes('validation'))) {
      recommendations.push({
        priority: 'high',
        category: 'input-validation',
        action: 'Setup input validation and sanitization framework',
        command: 'claude-dev-standards security setup --validation'
      });
    }

    if (results.failed.some(f => f.includes('RBAC'))) {
      recommendations.push({
        priority: 'high',
        category: 'authorization',
        action: 'Implement Role-Based Access Control (RBAC)',
        command: 'claude-dev-standards security setup --rbac'
      });
    }

    return recommendations;
  }
}

module.exports = SecurityCommand;