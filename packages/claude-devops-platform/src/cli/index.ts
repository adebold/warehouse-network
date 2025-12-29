import { Command } from 'commander';
import chalk from 'chalk';
import { GitOpsCommand } from './commands/gitops';
import { MonorepoCommand } from './commands/monorepo';
import { InfrastructureCommand } from './commands/infrastructure';
import { KubernetesCommand } from './commands/kubernetes';
import { SecurityCommand } from './commands/security';
import { ObservabilityCommand } from './commands/observability';
import { DatabaseCommand } from './commands/database';
import { createQualityCommand } from './commands/quality';
import { logger } from '../utils/logger';

export async function run() {
  const program = new Command();

  program
    .name('claude-platform')
    .description('Claude DevOps Platform CLI - Manage your platform infrastructure')
    .version('1.0.0')
    .option('-v, --verbose', 'Enable verbose logging')
    .hook('preAction', (thisCommand) => {
      if (thisCommand.opts().verbose) {
        logger.setLevel('DEBUG');
      }
    });

  // Add commands
  program.addCommand(new GitOpsCommand());
  program.addCommand(new MonorepoCommand());
  program.addCommand(new InfrastructureCommand());
  program.addCommand(new KubernetesCommand());
  program.addCommand(new SecurityCommand());
  program.addCommand(new ObservabilityCommand());
  program.addCommand(new DatabaseCommand());
  program.addCommand(createQualityCommand());

  // Init command
  program
    .command('init')
    .description('Initialize Claude Platform in an existing project')
    .option('-g, --gitops', 'Add GitOps configuration')
    .option('-m, --monorepo', 'Convert to monorepo')
    .option('-i, --infrastructure', 'Add infrastructure as code')
    .option('-k, --kubernetes', 'Add Kubernetes configuration')
    .option('-o, --observability', 'Add observability stack')
    .option('-s, --security', 'Add security scanning')
    .action(async (options) => {
      try {
        logger.info('Initializing Claude Platform...');
        // Implementation will be in a separate module
        const { initializePlatform } = await import('./commands/init');
        await initializePlatform(process.cwd(), options);
        logger.success('Claude Platform initialized successfully!');
      } catch (error) {
        logger.error('Failed to initialize platform:', error instanceof Error ? error : new Error(String(error)));
        process.exit(1);
      }
    });

  // Doctor command
  program
    .command('doctor')
    .description('Check your platform setup and dependencies')
    .action(async () => {
      try {
        const { runDoctor } = await import('./commands/doctor');
        await runDoctor();
      } catch (error) {
        logger.error('Doctor command failed:', error instanceof Error ? error : new Error(String(error)));
        process.exit(1);
      }
    });

  // Upgrade command
  program
    .command('upgrade')
    .description('Upgrade platform dependencies and configurations')
    .option('--dry-run', 'Show what would be upgraded without making changes')
    .action(async (options) => {
      try {
        const { runUpgrade } = await import('./commands/upgrade');
        await runUpgrade(options);
      } catch (error) {
        logger.error('Upgrade failed:', error instanceof Error ? error : new Error(String(error)));
        process.exit(1);
      }
    });

  // Generate command
  program
    .command('generate <type> <name>')
    .alias('g')
    .description('Generate new components (service, package, module, etc.)')
    .option('-t, --typescript', 'Use TypeScript', true)
    .option('--dry-run', 'Show what would be generated')
    .action(async (type: string, name: string, options) => {
      try {
        const { runGenerate } = await import('./commands/generate');
        await runGenerate(type, name, options);
      } catch (error) {
        logger.error('Generation failed:', error instanceof Error ? error : new Error(String(error)));
        process.exit(1);
      }
    });

  // Deploy command
  program
    .command('deploy [environment]')
    .description('Deploy your application')
    .option('-t, --target <target>', 'Deployment target (k8s, serverless, vm)')
    .option('--dry-run', 'Show deployment plan without applying')
    .option('--force', 'Force deployment even with warnings')
    .option('--skip-quality', 'Skip quality gate checks')
    .option('--quality-project-path <path>', 'Path to analyze for quality checks')
    .action(async (environment = 'development', options) => {
      try {
        const { runDeploy } = await import('./commands/deploy');
        await runDeploy(environment, options);
      } catch (error) {
        logger.error('Deployment failed:', error instanceof Error ? error : new Error(String(error)));
        process.exit(1);
      }
    });

  // Status command
  program
    .command('status')
    .description('Show platform status and health')
    .option('-w, --watch', 'Watch for changes')
    .action(async (options) => {
      try {
        const { showStatus } = await import('./commands/status');
        await showStatus(options);
      } catch (error) {
        logger.error('Status command failed:', error instanceof Error ? error : new Error(String(error)));
        process.exit(1);
      }
    });

  // Parse arguments
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    logger.error('Command failed:', error instanceof Error ? error : new Error(String(error)));
    process.exit(1);
  }

  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}