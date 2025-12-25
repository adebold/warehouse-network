const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const path = require('path');
const validator = require('../validator');
const config = require('../config');

const fixers = {
  'missing-env-example': {
    description: 'Create .env.example file',
    fix: async (projectPath) => {
      const envPath = path.join(projectPath, '.env');
      const examplePath = path.join(projectPath, '.env.example');
      
      if (await fs.exists(envPath)) {
        const content = await fs.readFile(envPath, 'utf-8');
        const sanitized = content.replace(/=.*/g, '=');
        await fs.writeFile(examplePath, sanitized);
      } else {
        const template = `NODE_ENV=
PORT=
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
SESSION_SECRET=`;
        await fs.writeFile(examplePath, template);
      }
    }
  },
  
  'console-log': {
    description: 'Replace console.log with proper logger',
    fix: async (projectPath, locations) => {
      for (const location of locations) {
        const filePath = path.join(projectPath, location.file);
        let content = await fs.readFile(filePath, 'utf-8');
        
        // Add logger import if not present
        if (!content.includes('logger') && !content.includes('winston') && !content.includes('pino')) {
          content = `const logger = require('./utils/logger');\n${content}`;
        }
        
        // Replace console.log
        content = content.replace(/console\.log\(/g, 'logger.info(');
        content = content.replace(/console\.error\(/g, 'logger.error(');
        content = content.replace(/console\.warn\(/g, 'logger.warn(');
        
        await fs.writeFile(filePath, content);
      }
    }
  },
  
  'missing-gitignore': {
    description: 'Create comprehensive .gitignore',
    fix: async (projectPath) => {
      const gitignorePath = path.join(projectPath, '.gitignore');
      const template = `# Dependencies
node_modules/
bower_components/

# Build outputs
dist/
build/
*.log
.cache/

# Environment files
.env
.env.local
.env.*.local
!.env.example

# IDE files
.idea/
.vscode/
*.swp
*.swo
.DS_Store

# Test coverage
coverage/
.nyc_output/

# Claude standards
.claude-standards-cache/
validation-report.json`;
      
      await fs.writeFile(gitignorePath, template);
    }
  },
  
  'missing-healthcheck': {
    description: 'Add health check endpoint',
    fix: async (projectPath) => {
      const healthCheckCode = `// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Readiness check
app.get('/ready', async (req, res) => {
  try {
    // Check database connection
    await db.ping();
    // Check Redis connection
    await redis.ping();
    
    res.status(200).json({ status: 'ready' });
  } catch (error) {
    res.status(503).json({ status: 'not ready', error: error.message });
  }
});`;
      
      console.log(chalk.yellow('\nAdd this health check code to your main application file:'));
      console.log(healthCheckCode);
    }
  },
  
  'weak-password-hashing': {
    description: 'Update to use bcrypt or argon2',
    fix: async (projectPath) => {
      console.log(chalk.yellow('\nTo fix weak password hashing:'));
      console.log('1. Install bcrypt: ' + chalk.cyan('npm install bcrypt'));
      console.log('2. Replace MD5/SHA hashing with bcrypt:');
      console.log(chalk.gray(`
const bcrypt = require('bcrypt');

// Hashing
const hashedPassword = await bcrypt.hash(plainPassword, 10);

// Verification
const isValid = await bcrypt.compare(plainPassword, hashedPassword);
`));
    }
  }
};

async function fix(options = {}) {
  const spinner = ora('Analyzing project for fixable issues...').start();
  
  try {
    // Load configuration
    const configuration = await config.load(process.cwd());
    
    // Run validation to find issues
    const results = await validator.validate(process.cwd(), configuration);
    spinner.stop();
    
    if (!results.fixable || results.fixable.length === 0) {
      console.log(chalk.green('✓ No auto-fixable issues found!'));
      return;
    }
    
    console.log(chalk.yellow(`\nFound ${results.fixable.length} auto-fixable issue(s):\n`));
    
    // Group fixable issues
    const fixableByType = {};
    results.fixable.forEach(issue => {
      if (!fixableByType[issue.type]) {
        fixableByType[issue.type] = [];
      }
      fixableByType[issue.type].push(issue);
    });
    
    // Interactive mode
    if (options.interactive) {
      const selectedFixes = await selectFixes(fixableByType);
      if (selectedFixes.length === 0) {
        console.log('No fixes selected.');
        return;
      }
      await applyFixes(selectedFixes, options.dryRun);
    } else {
      // Fix all
      const allFixes = Object.entries(fixableByType).map(([type, issues]) => ({
        type,
        issues
      }));
      await applyFixes(allFixes, options.dryRun);
    }
    
    if (!options.dryRun) {
      console.log(chalk.green('\n✓ Fixes applied successfully!'));
      console.log('Run ' + chalk.cyan('npx cds validate') + ' to verify.');
    }
    
  } catch (error) {
    spinner.fail(`Fix failed: ${error.message}`);
    console.error(chalk.red(error.stack));
    process.exit(1);
  }
}

async function selectFixes(fixableByType) {
  const choices = Object.entries(fixableByType).map(([type, issues]) => ({
    name: `${fixers[type]?.description || type} (${issues.length} issue(s))`,
    value: { type, issues },
    checked: true
  }));
  
  const { selectedFixes } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedFixes',
      message: 'Select fixes to apply:',
      choices
    }
  ]);
  
  return selectedFixes;
}

async function applyFixes(fixes, dryRun) {
  for (const { type, issues } of fixes) {
    const fixer = fixers[type];
    
    if (!fixer) {
      console.log(chalk.yellow(`No automatic fix available for: ${type}`));
      continue;
    }
    
    console.log(`\n${chalk.bold(fixer.description)}...`);
    
    if (dryRun) {
      console.log(chalk.gray('(dry run - no changes will be made)'));
    } else {
      await fixer.fix(process.cwd(), issues);
      console.log(chalk.green('✓ Fixed'));
    }
  }
}

module.exports = fix;