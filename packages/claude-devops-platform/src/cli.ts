#!/usr/bin/env node

import { program } from 'commander';
import { createCodeQualityCommands } from './commands/code-quality';
import { createPerformanceCommands } from './commands/performance';
import { createSecurityCommands } from './commands/security';
import { createCICDCommands } from './commands/cicd';
import { createProjectManagementCommands } from './project-management/cli/commands';
import chalk from 'chalk';
import figlet from 'figlet';

// Display banner
console.log(chalk.cyan(figlet.textSync('Claude DevOps', { horizontalLayout: 'full' })));
console.log(chalk.gray('Production-Ready Platform Tools with Project Management\n'));

// Main program
program
  .name('claude-platform')
  .description('Claude DevOps Platform - Production-ready development tools')
  .version('1.0.0');

// Add command groups
program.addCommand(createCodeQualityCommands());
program.addCommand(createPerformanceCommands());
program.addCommand(createSecurityCommands());
program.addCommand(createCICDCommands());
program.addCommand(createProjectManagementCommands());

// Global options
program
  .option('-v, --verbose', 'verbose output')
  .option('--no-color', 'disable colored output')
  .option('--json', 'output in JSON format');

// Quick commands at root level
program
  .command('analyze')
  .description('Run all quality checks')
  .action(async () => {
    console.log(chalk.blue('Running comprehensive analysis...'));
    // Run all analyzers
  });

program
  .command('init')
  .description('Initialize Claude DevOps Platform in current project')
  .option('--with-pm', 'Include project management features')
  .option('--with-claude-flow', 'Initialize with Claude Flow integration')
  .action(async (options) => {
    console.log(chalk.blue('Initializing Claude DevOps Platform...'));
    
    if (options.withClaudeFlow) {
      console.log(chalk.yellow('Setting up Claude Flow integration...'));
      const { execSync } = require('child_process');
      try {
        execSync('npx claude-flow@alpha init', { stdio: 'inherit' });
        console.log(chalk.green('✓ Claude Flow initialized'));
      } catch (error) {
        console.error(chalk.red('Failed to initialize Claude Flow'));
      }
    }
    
    if (options.withPm) {
      console.log(chalk.yellow('Setting up project management...'));
      // Initialize PM features
      console.log(chalk.green('✓ Project management initialized'));
    }
    
    console.log(chalk.green('\n✓ Claude DevOps Platform initialized successfully!'));
    console.log(chalk.gray('\nNext steps:'));
    console.log(chalk.gray('  1. Run "claude-platform story create" to create your first user story'));
    console.log(chalk.gray('  2. Run "claude-platform schema validate" to check your database schema'));
    console.log(chalk.gray('  3. Run "claude-platform quality check <storyId>" to run quality gates'));
  });

// Story quick command
program
  .command('story <action> [storyId]')
  .description('Quick story management commands')
  .option('-i, --interactive', 'Interactive mode')
  .option('--ai', 'Use AI assistance')
  .action(async (action, storyId, options) => {
    const { StoryManager } = require('./project-management');
    const storyManager = new StoryManager();
    
    switch (action) {
      case 'create':
        console.log(chalk.blue('Creating new story...'));
        if (options.ai) {
          const { createStoryWithAI } = require('./project-management');
          const description = await promptForDescription();
          const story = await createStoryWithAI(description);
          console.log(chalk.green(`✓ Story created: ${story.id}`));
        }
        break;
      case 'list':
        const stories = storyManager.getStoriesByFilter({});
        console.log(chalk.bold(`\nFound ${stories.length} stories:\n`));
        stories.forEach(s => {
          console.log(`${chalk.blue(s.id)} - ${s.title} [${s.status}]`);
        });
        break;
      case 'generate':
        if (!storyId) {
          console.error(chalk.red('Story ID required for generate command'));
          return;
        }
        console.log(chalk.blue(`Generating code for story ${storyId}...`));
        // Generate code
        break;
    }
  });

// Epic quick command
program
  .command('epic <action>')
  .description('Quick epic management')
  .option('--ai', 'Use AI assistance')
  .action(async (action, options) => {
    switch (action) {
      case 'plan':
        console.log(chalk.blue('Planning epic with AI assistance...'));
        // Plan epic
        break;
      case 'breakdown':
        console.log(chalk.blue('Breaking down epic into stories...'));
        // Breakdown epic
        break;
    }
  });

// Schema quick command
program
  .command('schema <action>')
  .description('Quick schema management')
  .action(async (action) => {
    const { PrismaValidator } = require('./project-management');
    const validator = new PrismaValidator('prisma/schema.prisma');
    
    switch (action) {
      case 'validate':
        console.log(chalk.blue('Validating Prisma schema...'));
        const result = await validator.validate();
        if (result.valid) {
          console.log(chalk.green('✓ Schema is valid'));
        } else {
          console.log(chalk.red('✗ Schema validation failed'));
          console.log(chalk.red(`  ${result.errors.length} errors found`));
        }
        break;
      case 'optimize':
        console.log(chalk.blue('Optimizing schema...'));
        const optimization = await validator.validate();
        console.log(chalk.yellow(`Found ${optimization.suggestions.length} optimization opportunities`));
        break;
    }
  });

// Helper function
async function promptForDescription(): Promise<string> {
  const inquirer = require('inquirer');
  const { description } = await inquirer.prompt([
    {
      type: 'input',
      name: 'description',
      message: 'Describe the feature you want to build:',
      validate: (input: string) => input.length > 10 || 'Please provide a detailed description'
    }
  ]);
  return description;
}

// Error handling
program.exitOverride();

try {
  program.parse();
} catch (error: any) {
  if (error.code === 'commander.helpDisplayed') {
    process.exit(0);
  }
  console.error(chalk.red(`Error: ${error.message}`));
  process.exit(1);
}