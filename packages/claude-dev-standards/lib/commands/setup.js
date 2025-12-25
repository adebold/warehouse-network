const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const templateManager = require('../utils/templateManager');
const projectDetector = require('../utils/projectDetector');

const components = {
  docker: {
    name: 'Docker',
    description: 'Set up Docker configuration with multi-stage builds',
    templates: ['docker/Dockerfile', 'docker/docker-compose.yml', 'docker/.dockerignore'],
    questions: [
      {
        type: 'list',
        name: 'baseImage',
        message: 'Select base image:',
        choices: ['node:20-alpine', 'node:18-alpine', 'python:3.11-slim', 'golang:1.21-alpine']
      },
      {
        type: 'confirm',
        name: 'includeNginx',
        message: 'Include Nginx reverse proxy?',
        default: true
      }
    ]
  },
  
  ci: {
    name: 'CI/CD',
    description: 'Set up GitHub Actions workflows',
    templates: ['github/claude-standards.yml', 'github/deploy.yml', 'github/security.yml'],
    questions: [
      {
        type: 'checkbox',
        name: 'environments',
        message: 'Select deployment environments:',
        choices: ['staging', 'production'],
        default: ['staging', 'production']
      }
    ]
  },
  
  testing: {
    name: 'Testing',
    description: 'Configure testing framework with coverage',
    templates: ['testing/jest.config.js', 'testing/vitest.config.js', 'testing/setup.js'],
    questions: [
      {
        type: 'list',
        name: 'framework',
        message: 'Select testing framework:',
        choices: ['jest', 'vitest', 'mocha', 'pytest']
      },
      {
        type: 'number',
        name: 'coverageThreshold',
        message: 'Minimum coverage percentage:',
        default: 80
      }
    ]
  },
  
  database: {
    name: 'Database',
    description: 'Set up database migrations and configuration',
    templates: ['database/migrations', 'database/seeds', 'database/config.js'],
    questions: [
      {
        type: 'list',
        name: 'orm',
        message: 'Select ORM/query builder:',
        choices: ['prisma', 'typeorm', 'sequelize', 'knex', 'none']
      },
      {
        type: 'checkbox',
        name: 'databases',
        message: 'Select databases:',
        choices: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis'],
        default: ['PostgreSQL', 'Redis']
      }
    ]
  },
  
  monitoring: {
    name: 'Monitoring',
    description: 'Add monitoring and observability',
    templates: ['monitoring/logger.js', 'monitoring/metrics.js', 'monitoring/tracing.js'],
    questions: [
      {
        type: 'checkbox',
        name: 'features',
        message: 'Select monitoring features:',
        choices: [
          'Structured logging',
          'Metrics collection',
          'Distributed tracing',
          'Error tracking',
          'Performance monitoring'
        ],
        default: ['Structured logging', 'Metrics collection', 'Error tracking']
      }
    ]
  }
};

async function setup(component) {
  const componentConfig = components[component];
  
  if (!componentConfig) {
    console.error(chalk.red(`Unknown component: ${component}`));
    console.log('Available components:', Object.keys(components).join(', '));
    process.exit(1);
  }
  
  const spinner = ora(`Setting up ${componentConfig.name}...`).start();
  
  try {
    // Detect project type
    const projectType = await projectDetector.detect(process.cwd());
    spinner.succeed(`Project type: ${projectType}`);
    
    // Ask component-specific questions
    const answers = await inquirer.prompt(componentConfig.questions);
    
    // Copy and customize templates
    spinner.start(`Installing ${componentConfig.name} templates...`);
    
    await templateManager.copyTemplates(
      componentConfig.templates,
      process.cwd(),
      {
        projectType,
        ...answers
      }
    );
    
    spinner.succeed(`${componentConfig.name} setup completed!`);
    
    // Show next steps
    console.log('\n' + chalk.bold('Next steps:'));
    
    switch (component) {
      case 'docker':
        console.log('1. Review and customize the Dockerfile');
        console.log('2. Update docker-compose.yml with your services');
        console.log('3. Run ' + chalk.cyan('docker-compose up') + ' to test');
        break;
        
      case 'ci':
        console.log('1. Commit the workflow files');
        console.log('2. Push to GitHub to activate workflows');
        console.log('3. Configure secrets in repository settings');
        break;
        
      case 'testing':
        console.log('1. Install testing dependencies: ' + chalk.cyan(`npm install -D ${answers.framework}`));
        console.log('2. Write your first test');
        console.log('3. Run ' + chalk.cyan('npm test') + ' to execute tests');
        break;
        
      case 'database':
        console.log('1. Install database dependencies');
        console.log('2. Configure database connection');
        console.log('3. Run migrations: ' + chalk.cyan('npm run migrate'));
        break;
        
      case 'monitoring':
        console.log('1. Install monitoring dependencies');
        console.log('2. Configure monitoring endpoints');
        console.log('3. Test with ' + chalk.cyan('curl http://localhost:3000/metrics'));
        break;
    }
    
  } catch (error) {
    spinner.fail(`Setup failed: ${error.message}`);
    console.error(chalk.red(error.stack));
    process.exit(1);
  }
}

module.exports = setup;