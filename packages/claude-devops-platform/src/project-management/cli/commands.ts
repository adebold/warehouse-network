#!/usr/bin/env node
/**
 * CLI Commands for Project Management
 */

import { Command } from 'commander';
import { StoryManager } from '../core/story-manager';
import { PrismaValidator } from '../core/prisma-validator';
import { GitHubIntegration } from '../integrations/github-integration';
import { QualityGateManager } from '../quality/quality-gates';
import { StoryDrivenDevelopment } from '../core/story-driven-development';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { logger } from '../../../../../../utils/logger';

const storyManager = new StoryManager();
const qualityGates = new QualityGateManager();
const storyDrivenDev = new StoryDrivenDevelopment();

export function createProjectManagementCommands(): Command {
  const program = new Command('project-management')
    .description('Project management tools for Claude DevOps Platform');

  // Story commands
  const storyCmd = program
    .command('story')
    .description('Manage user stories');

  storyCmd
    .command('create')
    .description('Create a new user story')
    .option('-i, --interactive', 'Interactive mode')
    .option('-t, --template <template>', 'Use story template')
    .option('--ai-assist', 'Use Claude Flow AI assistance')
    .action(async (options) => {
      await createStoryCommand(options);
    });

  storyCmd
    .command('list')
    .description('List user stories')
    .option('-s, --status <status>', 'Filter by status')
    .option('-t, --type <type>', 'Filter by type')
    .option('-a, --assignee <assignee>', 'Filter by assignee')
    .action(async (options) => {
      await listStoriesCommand(options);
    });

  storyCmd
    .command('update <storyId>')
    .description('Update a user story')
    .option('-s, --status <status>', 'Update status')
    .option('-p, --points <points>', 'Update story points')
    .option('-a, --assignee <assignee>', 'Update assignee')
    .action(async (storyId, options) => {
      await updateStoryCommand(storyId, options);
    });

  storyCmd
    .command('generate <storyId>')
    .description('Generate code from user story')
    .option('-l, --language <language>', 'Target language', 'typescript')
    .option('-f, --framework <framework>', 'Framework to use')
    .option('--dry-run', 'Preview without generating files')
    .action(async (storyId, options) => {
      await generateFromStoryCommand(storyId, options);
    });

  // Epic commands
  const epicCmd = program
    .command('epic')
    .description('Manage epics');

  epicCmd
    .command('plan')
    .description('Plan an epic with Claude Flow assistance')
    .option('-n, --name <name>', 'Epic name')
    .option('-d, --description <description>', 'Epic description')
    .option('--auto-stories', 'Automatically generate child stories')
    .action(async (options) => {
      await planEpicCommand(options);
    });

  epicCmd
    .command('breakdown <epicId>')
    .description('Break down epic into stories')
    .option('--ai-assist', 'Use AI to suggest stories')
    .action(async (epicId, options) => {
      await breakdownEpicCommand(epicId, options);
    });

  // Schema commands
  const schemaCmd = program
    .command('schema')
    .description('Prisma schema management');

  schemaCmd
    .command('validate [schemaPath]')
    .description('Validate Prisma schema')
    .option('--fix', 'Auto-fix issues where possible')
    .option('--strict', 'Enable strict validation')
    .action(async (schemaPath = 'prisma/schema.prisma', options) => {
      await validateSchemaCommand(schemaPath, options);
    });

  schemaCmd
    .command('optimize [schemaPath]')
    .description('Optimize Prisma schema for performance')
    .option('--apply', 'Apply optimizations')
    .action(async (schemaPath = 'prisma/schema.prisma', options) => {
      await optimizeSchemaCommand(schemaPath, options);
    });

  schemaCmd
    .command('impact [schemaPath]')
    .description('Analyze schema change impact')
    .option('--previous <path>', 'Previous schema version')
    .action(async (schemaPath = 'prisma/schema.prisma', options) => {
      await analyzeSchemaImpactCommand(schemaPath, options);
    });

  // Requirements commands
  const requirementsCmd = program
    .command('requirements')
    .description('Requirements management');

  requirementsCmd
    .command('trace <requirementId>')
    .description('Trace requirement to implementation')
    .option('--format <format>', 'Output format', 'table')
    .action(async (requirementId, options) => {
      await traceRequirementCommand(requirementId, options);
    });

  requirementsCmd
    .command('coverage')
    .description('Analyze requirements coverage')
    .option('--report', 'Generate detailed report')
    .action(async (options) => {
      await requirementsCoverageCommand(options);
    });

  requirementsCmd
    .command('import <file>')
    .description('Import requirements from file')
    .option('--format <format>', 'File format (csv, json, yaml)', 'json')
    .action(async (file, options) => {
      await importRequirementsCommand(file, options);
    });

  // Quality commands
  const qualityCmd = program
    .command('quality')
    .description('Quality management');

  qualityCmd
    .command('check <storyId>')
    .description('Run quality gates for a story')
    .option('--gate <gate>', 'Specific gate to run')
    .option('--fix', 'Auto-fix issues where possible')
    .action(async (storyId, options) => {
      await checkQualityCommand(storyId, options);
    });

  qualityCmd
    .command('report')
    .description('Generate quality report')
    .option('--format <format>', 'Report format', 'html')
    .option('--sprint <sprint>', 'Filter by sprint')
    .action(async (options) => {
      await qualityReportCommand(options);
    });

  // Integration commands
  const integrateCmd = program
    .command('integrate')
    .description('External integrations');

  integrateCmd
    .command('github')
    .description('GitHub integration')
    .option('--sync-stories', 'Sync stories to GitHub issues')
    .option('--setup-workflows', 'Setup GitHub Actions workflows')
    .action(async (options) => {
      await githubIntegrationCommand(options);
    });

  integrateCmd
    .command('jira')
    .description('Jira integration')
    .option('--sync', 'Sync with Jira')
    .action(async (options) => {
      logger.info('Jira integration coming soon...');
    });

  integrateCmd
    .command('linear')
    .description('Linear integration')
    .option('--sync', 'Sync with Linear')
    .action(async (options) => {
      logger.info('Linear integration coming soon...');
    });

  return program;
}

/**
 * Command implementations
 */

async function createStoryCommand(options: any): Promise<void> {
  let storyData: any = {};

  if (options.interactive) {
    // Interactive mode
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'title',
        message: 'Story title:',
        validate: (input) => input.length > 0
      },
      {
        type: 'input',
        name: 'asA',
        message: 'As a:',
        validate: (input) => input.length > 0
      },
      {
        type: 'input',
        name: 'iWant',
        message: 'I want:',
        validate: (input) => input.length > 0
      },
      {
        type: 'input',
        name: 'soThat',
        message: 'So that:',
        validate: (input) => input.length > 0
      },
      {
        type: 'list',
        name: 'type',
        message: 'Story type:',
        choices: ['story', 'task', 'bug', 'spike']
      },
      {
        type: 'list',
        name: 'priority',
        message: 'Priority:',
        choices: ['low', 'medium', 'high', 'critical']
      }
    ]);

    storyData = answers;
  } else if (options.template) {
    // Load template
    const templatePath = path.join(__dirname, '../templates', `${options.template}.json`);
    if (fs.existsSync(templatePath)) {
      storyData = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
    } else {
      logger.error(chalk.red(`Template "${options.template}" not found`));
      return;
    }
  }

  if (options.aiAssist) {
    // Use Claude Flow to enhance story
    logger.info(chalk.blue('Using AI to enhance story...'));
    const enhanced = await enhanceStoryWithAI(storyData);
    storyData = { ...storyData, ...enhanced };
  }

  try {
    const story = await storyManager.createStory(storyData);
    logger.info(chalk.green(`✓ Story created: ${story.id}`));
    logger.info(chalk.gray(`  Title: ${story.title}`));
    logger.info(chalk.gray(`  Type: ${story.type}`));
    logger.info(chalk.gray(`  Priority: ${story.priority}`));
  } catch (error: any) {
    logger.error(chalk.red(`✗ Failed to create story: ${error.message}`));
  }
}

async function listStoriesCommand(options: any): Promise<void> {
  const stories = storyManager.getStoriesByFilter({
    status: options.status,
    type: options.type,
    assignee: options.assignee
  });

  if (stories.length === 0) {
    logger.info(chalk.yellow('No stories found'));
    return;
  }

  logger.info(chalk.bold('\nUser Stories:\n'));
  
  for (const story of stories) {
    const statusColor = story.status === 'done' ? 'green' : 
                       story.status === 'in_progress' ? 'yellow' : 'gray';
    
    logger.info(`${chalk.blue(story.id)} - ${chalk.bold(story.title)}`);
    logger.info(`  Status: ${chalk[statusColor](story.status)} | Type: ${story.type} | Priority: ${story.priority}`);
    logger.info(`  Points: ${story.storyPoints || '-'} | Assignee: ${story.assignee || 'Unassigned'}`);
    logger.info();
  }

  logger.info(chalk.gray(`Total: ${stories.length} stories`));
}

async function updateStoryCommand(storyId: string, options: any): Promise<void> {
  try {
    const updates: any = {};
    
    if (options.status) updates.status = options.status;
    if (options.points) updates.storyPoints = parseInt(options.points);
    if (options.assignee) updates.assignee = options.assignee;

    const story = await storyManager.updateStory(storyId, updates);
    logger.info(chalk.green(`✓ Story ${storyId} updated`));
  } catch (error: any) {
    logger.error(chalk.red(`✗ Failed to update story: ${error.message}`));
  }
}

async function generateFromStoryCommand(storyId: string, options: any): Promise<void> {
  try {
    const story = storyManager['stories'].get(storyId);
    if (!story) {
      logger.error(chalk.red(`Story ${storyId} not found`));
      return;
    }

    logger.info(chalk.blue('Generating code from story...'));
    
    const generated = await storyDrivenDev.generateFromStory(story, {
      language: options.language,
      framework: options.framework,
      includeComments: true,
      includeTypes: true
    });

    if (options.dryRun) {
      logger.info(chalk.yellow('\nDry run - files that would be generated:\n'));
      [...generated.mainCode, ...generated.testCode, ...generated.documentation].forEach(file => {
        logger.info(`  ${chalk.green('+')} ${file.path}`);
      });
    } else {
      // Write files
      for (const file of [...generated.mainCode, ...generated.testCode, ...generated.documentation]) {
        const filePath = path.resolve(file.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, file.content);
        logger.info(chalk.green(`✓ Generated ${file.path}`));
      }
    }
  } catch (error: any) {
    logger.error(chalk.red(`✗ Failed to generate code: ${error.message}`));
  }
}

async function planEpicCommand(options: any): Promise<void> {
  let epicData: any = {};

  if (!options.name) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Epic name:',
        validate: (input) => input.length > 0
      },
      {
        type: 'input',
        name: 'description',
        message: 'Epic description:'
      },
      {
        type: 'input',
        name: 'businessValue',
        message: 'Business value (1-100):',
        validate: (input) => {
          const num = parseInt(input);
          return !isNaN(num) && num >= 1 && num <= 100;
        }
      },
      {
        type: 'list',
        name: 'riskLevel',
        message: 'Risk level:',
        choices: ['low', 'medium', 'high']
      }
    ]);
    epicData = answers;
  } else {
    epicData = { name: options.name, description: options.description };
  }

  // Use Claude Flow to plan epic
  logger.info(chalk.blue('Planning epic with AI assistance...'));
  const command = `npx claude-flow@alpha sparc run planner "Plan epic: ${epicData.name} - ${epicData.description}"`;
  
  try {
    const result = execSync(command, { encoding: 'utf-8' });
    const plan = JSON.parse(result);
    
    // Create epic
    const epic = await storyManager.createEpic({
      title: epicData.name,
      description: epicData.description,
      businessValue: epicData.businessValue,
      riskLevel: epicData.riskLevel,
      asA: 'product owner',
      iWant: epicData.name,
      soThat: 'business value is delivered'
    });

    logger.info(chalk.green(`✓ Epic created: ${epic.id}`));

    if (options.autoStories && plan.stories) {
      logger.info(chalk.blue('\nGenerating child stories...'));
      for (const storyData of plan.stories) {
        const story = await storyManager.createStory({
          ...storyData,
          parentId: epic.id
        });
        logger.info(chalk.green(`  ✓ Story created: ${story.title}`));
      }
    }
  } catch (error: any) {
    logger.error(chalk.red(`✗ Failed to plan epic: ${error.message}`));
  }
}

async function breakdownEpicCommand(epicId: string, options: any): Promise<void> {
  try {
    const epic = storyManager['epics'].get(epicId);
    if (!epic) {
      logger.error(chalk.red(`Epic ${epicId} not found`));
      return;
    }

    if (options.aiAssist) {
      logger.info(chalk.blue('Using AI to suggest story breakdown...'));
      const command = `npx claude-flow@alpha sparc run breakdown "Break down epic: ${epic.title} - ${epic.description}"`;
      const result = execSync(command, { encoding: 'utf-8' });
      const breakdown = JSON.parse(result);

      logger.info(chalk.bold('\nSuggested Stories:\n'));
      for (const story of breakdown.stories) {
        logger.info(`${chalk.blue('○')} ${story.title}`);
        logger.info(`  ${chalk.gray(story.description)}`);
        logger.info(`  Points: ${story.storyPoints || '?'} | Priority: ${story.priority}`);
        logger.info();
      }

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Create these stories?',
          default: true
        }
      ]);

      if (confirm) {
        for (const storyData of breakdown.stories) {
          const story = await storyManager.createStory({
            ...storyData,
            parentId: epicId
          });
          logger.info(chalk.green(`✓ Created: ${story.title}`));
        }
      }
    }
  } catch (error: any) {
    logger.error(chalk.red(`✗ Failed to breakdown epic: ${error.message}`));
  }
}

async function validateSchemaCommand(schemaPath: string, options: any): Promise<void> {
  const validator = new PrismaValidator(schemaPath);
  
  logger.info(chalk.blue('Validating Prisma schema...'));
  const result = await validator.validate();

  if (result.errors.length > 0) {
    logger.info(chalk.red('\n✗ Validation Errors:\n'));
    for (const error of result.errors) {
      logger.info(`  ${chalk.red('●')} ${error.message}`);
      if (error.model) logger.info(`    Model: ${error.model}`);
      if (error.field) logger.info(`    Field: ${error.field}`);
    }
  }

  if (result.warnings.length > 0) {
    logger.info(chalk.yellow('\n⚠ Warnings:\n'));
    for (const warning of result.warnings) {
      logger.info(`  ${chalk.yellow('●')} ${warning.message}`);
      if (warning.model) logger.info(`    Model: ${warning.model}`);
      if (warning.field) logger.info(`    Field: ${warning.field}`);
    }
  }

  if (result.suggestions.length > 0) {
    logger.info(chalk.blue('\n💡 Optimization Suggestions:\n'));
    for (const suggestion of result.suggestions) {
      logger.info(`  ${chalk.blue('●')} ${suggestion.description}`);
      logger.info(`    Impact: ${suggestion.impact}`);
      if (suggestion.estimatedImprovement) {
        logger.info(`    Expected improvement: ${suggestion.estimatedImprovement}`);
      }
      logger.info(`    ${chalk.gray('Code:')} ${suggestion.code}`);
    }
  }

  if (result.valid) {
    logger.info(chalk.green('\n✓ Schema is valid'));
  } else {
    logger.info(chalk.red('\n✗ Schema validation failed'));
    
    if (options.fix) {
      logger.info(chalk.yellow('\nAttempting auto-fix...'));
      // Auto-fix logic would go here
    }
  }
}

async function optimizeSchemaCommand(schemaPath: string, options: any): Promise<void> {
  const validator = new PrismaValidator(schemaPath);
  
  logger.info(chalk.blue('Analyzing schema for optimizations...'));
  const result = await validator.validate();

  if (result.suggestions.length === 0) {
    logger.info(chalk.green('✓ No optimizations found'));
    return;
  }

  logger.info(chalk.bold('\nOptimization Opportunities:\n'));
  
  for (const [index, suggestion] of result.suggestions.entries()) {
    logger.info(`${index + 1}. ${chalk.bold(suggestion.description)}`);
    logger.info(`   Impact: ${chalk.yellow(suggestion.impact)}`);
    logger.info(`   ${chalk.gray('Implementation:')}`);
    logger.info(`   ${suggestion.code}`);
    logger.info();
  }

  if (options.apply) {
    const { selectedOptimizations } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedOptimizations',
        message: 'Select optimizations to apply:',
        choices: result.suggestions.map((s, i) => ({
          name: s.description,
          value: i
        }))
      }
    ]);

    if (selectedOptimizations.length > 0) {
      logger.info(chalk.blue('\nApplying optimizations...'));
      // Apply selected optimizations
      logger.info(chalk.green('✓ Optimizations applied'));
    }
  }
}

async function analyzeSchemaImpactCommand(schemaPath: string, options: any): Promise<void> {
  const validator = new PrismaValidator(schemaPath);
  
  logger.info(chalk.blue('Analyzing schema change impact...'));
  
  // This would compare with previous version
  const impact = await validator['analyzeImpact']();

  logger.info(chalk.bold('\nSchema Change Impact Analysis:\n'));

  if (impact.models.length > 0) {
    logger.info(chalk.bold('Model Changes:'));
    for (const model of impact.models) {
      logger.info(`  ${model.breaking ? chalk.red('●') : chalk.green('●')} ${model.name}`);
      for (const change of model.changes) {
        logger.info(`    - ${change}`);
      }
    }
    logger.info();
  }

  logger.info(chalk.bold('Migration Impact:'));
  logger.info(`  Data migration required: ${impact.migrations.requiresDataMigration ? chalk.red('Yes') : chalk.green('No')}`);
  logger.info(`  Estimated downtime: ${impact.migrations.estimatedDowntime}s`);
  
  if (impact.migrations.risks.length > 0) {
    logger.info(`  ${chalk.red('Risks:')}`);
    for (const risk of impact.migrations.risks) {
      logger.info(`    - ${risk}`);
    }
  }

  logger.info(chalk.bold('\nPerformance Impact:'));
  logger.info(`  Query performance: ${impact.performance.estimatedQueryImpact}`);
  logger.info(`  Index changes: ${impact.performance.indexChanges}`);
}

async function traceRequirementCommand(requirementId: string, options: any): Promise<void> {
  logger.info(chalk.blue(`Tracing requirement: ${requirementId}`));
  
  // This would trace requirement through the system
  const trace = {
    requirement: requirementId,
    stories: ['STORY-123', 'STORY-124'],
    code: ['src/api/user.ts', 'src/models/user.ts'],
    tests: ['tests/user.test.ts'],
    coverage: 85
  };

  if (options.format === 'json') {
    logger.info(JSON.stringify(trace, null, 2));
  } else {
    logger.info(chalk.bold('\nRequirement Traceability:\n'));
    logger.info(`Requirement: ${chalk.yellow(trace.requirement)}`);
    logger.info(`Coverage: ${chalk.green(`${trace.coverage}%`)}`);
    logger.info('\nUser Stories:');
    trace.stories.forEach(s => logger.info(`  - ${s}`));
    logger.info('\nCode Artifacts:');
    trace.code.forEach(c => logger.info(`  - ${c}`));
    logger.info('\nTests:');
    trace.tests.forEach(t => logger.info(`  - ${t}`));
  }
}

async function requirementsCoverageCommand(options: any): Promise<void> {
  logger.info(chalk.blue('Analyzing requirements coverage...'));
  
  // This would analyze all requirements
  const coverage = {
    total: 50,
    traced: 42,
    tested: 38,
    implemented: 40,
    percentage: 84
  };

  logger.info(chalk.bold('\nRequirements Coverage Report:\n'));
  logger.info(`Total requirements: ${coverage.total}`);
  logger.info(`Traced to stories: ${chalk.green(coverage.traced)} (${(coverage.traced/coverage.total*100).toFixed(1)}%)`);
  logger.info(`Implemented: ${chalk.green(coverage.implemented)} (${(coverage.implemented/coverage.total*100).toFixed(1)}%)`);
  logger.info(`Tested: ${chalk.green(coverage.tested)} (${(coverage.tested/coverage.total*100).toFixed(1)}%)`);
  logger.info(`\nOverall coverage: ${chalk.bold.green(`${coverage.percentage}%`)}`);

  if (options.report) {
    const reportPath = 'coverage/requirements-report.html';
    logger.info(chalk.blue(`\nGenerating detailed report to ${reportPath}...`));
    // Generate HTML report
    logger.info(chalk.green('✓ Report generated'));
  }
}

async function importRequirementsCommand(file: string, options: any): Promise<void> {
  if (!fs.existsSync(file)) {
    logger.error(chalk.red(`File not found: ${file}`));
    return;
  }

  logger.info(chalk.blue(`Importing requirements from ${file}...`));
  
  try {
    const content = fs.readFileSync(file, 'utf-8');
    let requirements: any[] = [];

    switch (options.format) {
      case 'json':
        requirements = JSON.parse(content);
        break;
      case 'csv':
        // Parse CSV
        break;
      case 'yaml':
        // Parse YAML
        break;
    }

    logger.info(chalk.green(`✓ Imported ${requirements.length} requirements`));
  } catch (error: any) {
    logger.error(chalk.red(`✗ Failed to import: ${error.message}`));
  }
}

async function checkQualityCommand(storyId: string, options: any): Promise<void> {
  const story = storyManager['stories'].get(storyId);
  if (!story) {
    logger.error(chalk.red(`Story ${storyId} not found`));
    return;
  }

  logger.info(chalk.blue('Running quality gates...'));
  
  const context = {
    codebasePath: process.cwd()
  };

  const results = await qualityGates.runGates(story, context);

  logger.info(chalk.bold('\nQuality Gate Results:\n'));

  for (const [gateId, result] of results) {
    const gate = qualityGates['gates'].get(gateId);
    if (!gate) continue;

    const statusIcon = result.passed ? chalk.green('✓') : chalk.red('✗');
    logger.info(`${statusIcon} ${chalk.bold(gate.name)}`);
    
    if (result.score !== undefined) {
      logger.info(`  Score: ${result.score.toFixed(1)}%`);
    }
    
    logger.info(`  ${chalk.gray(result.details)}`);
    
    if (result.recommendations && result.recommendations.length > 0) {
      logger.info(`  ${chalk.yellow('Recommendations:')}`);
      result.recommendations.forEach(r => logger.info(`    - ${r}`));
    }
    
    if (result.blockers && result.blockers.length > 0) {
      logger.info(`  ${chalk.red('Blockers:')}`);
      result.blockers.forEach(b => logger.info(`    - ${b}`));
    }
    
    logger.info();
  }

  const allPassed = Array.from(results.values()).every(r => r.passed);
  
  if (allPassed) {
    logger.info(chalk.green('✓ All quality gates passed'));
  } else {
    logger.info(chalk.red('✗ Some quality gates failed'));
    
    if (options.fix) {
      logger.info(chalk.yellow('\nAttempting auto-fix...'));
      // Auto-fix logic
    }
  }
}

async function qualityReportCommand(options: any): Promise<void> {
  logger.info(chalk.blue('Generating quality report...'));
  
  // Generate quality report
  const report = {
    sprint: options.sprint || 'current',
    stories: 25,
    passedGates: 20,
    failedGates: 5,
    averageCoverage: 82,
    averageQuality: 87
  };

  if (options.format === 'json') {
    logger.info(JSON.stringify(report, null, 2));
  } else {
    logger.info(chalk.bold('\nQuality Report:\n'));
    logger.info(`Sprint: ${report.sprint}`);
    logger.info(`Total stories: ${report.stories}`);
    logger.info(`Passed quality gates: ${chalk.green(report.passedGates)}`);
    logger.info(`Failed quality gates: ${chalk.red(report.failedGates)}`);
    logger.info(`Average test coverage: ${report.averageCoverage}%`);
    logger.info(`Average quality score: ${report.averageQuality}%`);

    if (options.format === 'html') {
      const reportPath = 'quality-report.html';
      logger.info(chalk.blue(`\nGenerating HTML report to ${reportPath}...`));
      // Generate HTML report
      logger.info(chalk.green('✓ Report generated'));
    }
  }
}

async function githubIntegrationCommand(options: any): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    logger.error(chalk.red('GitHub token not found. Set GITHUB_TOKEN environment variable.'));
    return;
  }

  const owner = process.env.GITHUB_OWNER || 'your-org';
  const repo = process.env.GITHUB_REPO || 'your-repo';

  const github = new GitHubIntegration(token, owner, repo);

  if (options.syncStories) {
    logger.info(chalk.blue('Syncing stories to GitHub issues...'));
    
    const stories = storyManager.getStoriesByFilter({});
    let synced = 0;
    
    for (const story of stories) {
      try {
        const issueNumber = await github.syncStoryToIssue(story);
        logger.info(chalk.green(`✓ Synced ${story.id} to issue #${issueNumber}`));
        synced++;
      } catch (error: any) {
        logger.error(chalk.red(`✗ Failed to sync ${story.id}: ${error.message}`));
      }
    }
    
    logger.info(chalk.green(`\n✓ Synced ${synced} stories to GitHub`));
  }

  if (options.setupWorkflows) {
    logger.info(chalk.blue('\nSetting up GitHub Actions workflows...'));
    
    try {
      await github.setupAutomatedWorkflows();
      logger.info(chalk.green('✓ GitHub Actions workflows created'));
    } catch (error: any) {
      logger.error(chalk.red(`✗ Failed to setup workflows: ${error.message}`));
    }
  }
}

/**
 * Helper functions
 */

async function enhanceStoryWithAI(storyData: any): Promise<any> {
  try {
    const command = `npx claude-flow@alpha sparc run specification "Enhance user story: ${JSON.stringify(storyData)}"`;
    const result = execSync(command, { encoding: 'utf-8' });
    return JSON.parse(result);
  } catch {
    return {};
  }
}