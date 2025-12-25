const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const fs = require('fs-extra');
const path = require('path');
const projectDetector = require('../utils/projectDetector');
const templateManager = require('../utils/templateManager');
const gitHooks = require('../utils/gitHooks');

async function init(options) {
  const spinner = ora('Initializing Claude Dev Standards...').start();
  
  try {
    // Detect project type
    const detectedType = await projectDetector.detect(process.cwd());
    const projectType = options.type || detectedType || 'unknown';
    
    spinner.succeed(`Detected project type: ${chalk.cyan(projectType)}`);
    
    // Check for existing configuration
    const configPath = path.join(process.cwd(), '.claude-standards.json');
    if (await fs.exists(configPath) && !options.force) {
      spinner.fail('Configuration already exists. Use --force to overwrite.');
      process.exit(1);
    }
    
    // Prompt for configuration
    const answers = await promptConfiguration(projectType);
    
    // Create configuration
    spinner.start('Creating configuration files...');
    
    // Write main config
    await fs.writeJSON(configPath, answers.config, { spaces: 2 });
    
    // Copy templates based on selections
    if (answers.setupDocker) {
      await templateManager.copyTemplate('docker', process.cwd(), projectType);
    }
    
    if (answers.setupCI) {
      await templateManager.copyTemplate('github', process.cwd(), projectType);
    }
    
    if (answers.setupTesting) {
      await templateManager.copyTemplate('testing', process.cwd(), projectType);
    }
    
    if (answers.setupSecurity) {
      await templateManager.copyTemplate('security', process.cwd(), projectType);
      const SecurityValidator = require('../validators/security');
      const security = new SecurityValidator();
      await security.setupSecurity(process.cwd(), { 
        auth: true, 
        secrets: true, 
        rbac: true, 
        audit: true, 
        container: true 
      });
    }
    
    // Set up git hooks if requested
    if (answers.setupGitHooks && options.gitHooks !== false) {
      await gitHooks.install(process.cwd());
    }
    
    // Add to .gitignore
    await updateGitignore();
    
    spinner.succeed('Configuration created successfully!');
    
    // Show next steps
    console.log('\n' + chalk.bold('Next steps:'));
    console.log('1. Run ' + chalk.cyan('npx cds validate') + ' to check your project');
    console.log('2. Run ' + chalk.cyan('npx cds fix') + ' to auto-fix issues');
    console.log('3. Commit the configuration files to your repository');
    
    if (answers.setupCI) {
      console.log('\n' + chalk.yellow('GitHub Actions workflow added. Push to GitHub to activate.'));
    }
    
  } catch (error) {
    spinner.fail('Failed to initialize: ' + error.message);
    process.exit(1);
  }
}

async function promptConfiguration(projectType) {
  const questions = [
    {
      type: 'confirm',
      name: 'setupDocker',
      message: 'Set up Docker configuration?',
      default: true
    },
    {
      type: 'confirm',
      name: 'setupCI',
      message: 'Set up CI/CD workflows?',
      default: true
    },
    {
      type: 'confirm',
      name: 'setupTesting',
      message: 'Set up testing framework?',
      default: true
    },
    {
      type: 'confirm',
      name: 'setupSecurity',
      message: 'Set up security framework?',
      default: true
    },
    {
      type: 'confirm',
      name: 'setupGitHooks',
      message: 'Install git hooks for validation?',
      default: true
    },
    {
      type: 'number',
      name: 'minCoverage',
      message: 'Minimum test coverage percentage?',
      default: 80,
      validate: (input) => input >= 0 && input <= 100
    },
    {
      type: 'checkbox',
      name: 'databases',
      message: 'Select databases to support:',
      choices: [
        { name: 'PostgreSQL', value: 'postgres', checked: true },
        { name: 'MySQL', value: 'mysql' },
        { name: 'MongoDB', value: 'mongodb' },
        { name: 'Redis', value: 'redis', checked: true }
      ]
    }
  ];
  
  const answers = await inquirer.prompt(questions);
  
  // Build configuration object
  const config = {
    extends: 'claude-dev-standards/recommended',
    projectType: projectType,
    checks: {
      noMocks: true,
      realDatabase: true,
      authentication: true,
      errorHandling: true,
      logging: true,
      testing: true,
      docker: answers.setupDocker,
      ci: answers.setupCI
    },
    custom: {
      minTestCoverage: answers.minCoverage,
      databases: answers.databases,
      requiredEnvVars: generateRequiredEnvVars(answers.databases)
    }
  };
  
  return { ...answers, config };
}

function generateRequiredEnvVars(databases) {
  const envVars = ['NODE_ENV', 'PORT'];
  
  if (databases.includes('postgres')) {
    envVars.push('DATABASE_URL', 'POSTGRES_PASSWORD');
  }
  if (databases.includes('mysql')) {
    envVars.push('MYSQL_URL', 'MYSQL_ROOT_PASSWORD');
  }
  if (databases.includes('mongodb')) {
    envVars.push('MONGODB_URI');
  }
  if (databases.includes('redis')) {
    envVars.push('REDIS_URL');
  }
  
  envVars.push('JWT_SECRET', 'JWT_REFRESH_SECRET');
  
  return envVars;
}

async function updateGitignore() {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  const additions = [
    '\n# Claude Dev Standards',
    '.claude-standards-cache/',
    'validation-report.json',
    ''
  ].join('\n');
  
  if (await fs.exists(gitignorePath)) {
    const content = await fs.readFile(gitignorePath, 'utf-8');
    if (!content.includes('.claude-standards-cache')) {
      await fs.appendFile(gitignorePath, additions);
    }
  } else {
    await fs.writeFile(gitignorePath, additions);
  }
}

module.exports = init;