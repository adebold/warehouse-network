import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import path from 'path';
import fs from 'fs-extra';
import { validateProjectName } from '../utils/validation';
import { PlatformGenerator } from '../generators/platform';
import { GitOpsGenerator } from '../generators/gitops';
import { MonorepoGenerator } from '../generators/monorepo';
import { InfrastructureGenerator } from '../generators/infrastructure';
import { logger } from '../utils/logger';

interface CreateOptions {
  typescript?: boolean;
  gitops?: boolean;
  monorepo?: boolean;
  infrastructure?: boolean;
  cloud?: 'aws' | 'gcp' | 'azure' | 'all';
  kubernetes?: boolean;
  observability?: boolean;
  security?: boolean;
  skipInstall?: boolean;
  template?: string;
}

export async function run() {
  const program = new Command();

  program
    .name('create-claude-platform')
    .description('Create a new Claude Platform project with DevOps best practices')
    .argument('[project-name]', 'Name of the project')
    .option('-t, --typescript', 'Use TypeScript (default: true)', true)
    .option('-g, --gitops', 'Include GitOps setup', true)
    .option('-m, --monorepo', 'Set up as monorepo', true)
    .option('-i, --infrastructure', 'Include infrastructure as code', true)
    .option('-c, --cloud <provider>', 'Cloud provider (aws, gcp, azure, all)', 'aws')
    .option('-k, --kubernetes', 'Include Kubernetes manifests', true)
    .option('-o, --observability', 'Include observability stack', true)
    .option('-s, --security', 'Include security scanning', true)
    .option('--skip-install', 'Skip dependency installation', false)
    .option('--template <template>', 'Use a specific template')
    .action(async (projectName: string | undefined, options: CreateOptions) => {
      logger.info(chalk.cyan('\n🚀 Welcome to Claude DevOps Platform!\n'));

      // Get project name if not provided
      if (!projectName) {
        const { name } = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'What is your project name?',
            validate: (input: any) => {
              const validation = validateProjectName(input);
              return validation.valid || validation.errors.join(', ');
            },
          },
        ]);
        projectName = name;
      }

      // Validate project name
      const validation = validateProjectName(projectName!);
      if (!validation.valid) {
        logger.error(`Invalid project name: ${validation.errors.join(', ')}`);
        process.exit(1);
      }

      // Check if directory exists
      const projectPath = path.resolve(process.cwd(), projectName!);
      if (fs.existsSync(projectPath)) {
        const { overwrite } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: `Directory ${projectName} already exists. Overwrite?`,
            default: false,
          },
        ]);

        if (!overwrite) {
          logger.info('Operation cancelled');
          process.exit(0);
        }

        await fs.remove(projectPath);
      }

      // Get additional options if not provided
      if (options.template) {
        // Use template-specific defaults
        const templateDefaults = getTemplateDefaults(options.template);
        options = { ...templateDefaults, ...options };
      } else {
        // Interactive mode
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'monorepo',
            message: 'Set up as a monorepo?',
            default: options.monorepo !== false,
            when: options.monorepo === undefined,
          },
          {
            type: 'confirm',
            name: 'gitops',
            message: 'Include GitOps setup (GitHub Actions, ArgoCD)?',
            default: options.gitops !== false,
            when: options.gitops === undefined,
          },
          {
            type: 'confirm',
            name: 'infrastructure',
            message: 'Include infrastructure as code?',
            default: options.infrastructure !== false,
            when: options.infrastructure === undefined,
          },
          {
            type: 'list',
            name: 'cloud',
            message: 'Which cloud provider?',
            choices: [
              { name: 'AWS', value: 'aws' },
              { name: 'Google Cloud', value: 'gcp' },
              { name: 'Azure', value: 'azure' },
              { name: 'All providers', value: 'all' },
            ],
            default: 'aws',
            when: (answers: any) => answers.infrastructure && !options.cloud,
          },
          {
            type: 'confirm',
            name: 'kubernetes',
            message: 'Include Kubernetes configuration?',
            default: options.kubernetes !== false,
            when: options.kubernetes === undefined,
          },
          {
            type: 'confirm',
            name: 'observability',
            message: 'Include observability stack (Prometheus, Grafana, Jaeger)?',
            default: options.observability !== false,
            when: options.observability === undefined,
          },
          {
            type: 'confirm',
            name: 'security',
            message: 'Include security scanning (SAST/DAST)?',
            default: options.security !== false,
            when: options.security === undefined,
          },
        ]);

        options = { ...options, ...answers };
      }

      // Start generation
      const spinner = ora('Creating your Claude Platform project...').start();

      try {
        // Create project directory
        await fs.ensureDir(projectPath);

        // Generate platform base
        const platformGenerator = new PlatformGenerator(projectPath, {
          name: projectName!,
          ...options,
        });
        await platformGenerator.generate();
        spinner.text = 'Generated platform base...';

        // Generate GitOps if enabled
        if (options.gitops) {
          const gitopsGenerator = new GitOpsGenerator(projectPath, options);
          await gitopsGenerator.generate();
          spinner.text = 'Generated GitOps configuration...';
        }

        // Generate monorepo structure if enabled
        if (options.monorepo) {
          const monorepoGenerator = new MonorepoGenerator(projectPath, options);
          await monorepoGenerator.generate();
          spinner.text = 'Generated monorepo structure...';
        }

        // Generate infrastructure if enabled
        if (options.infrastructure) {
          const infraGenerator = new InfrastructureGenerator(projectPath, options);
          await infraGenerator.generate();
          spinner.text = 'Generated infrastructure code...';
        }

        spinner.succeed(chalk.green('✅ Project created successfully!'));

        // Display next steps
        logger.info('\n' + chalk.bold('Next steps:'));
        logger.info(chalk.cyan(`  cd ${projectName}`));
        
        if (!options.skipInstall) {
          logger.info(chalk.cyan('  npm install'));
        }

        if (options.gitops) {
          logger.info(chalk.cyan('  git init'));
          logger.info(chalk.cyan('  git add .'));
          logger.info(chalk.cyan('  git commit -m "Initial commit"'));
          logger.info(chalk.cyan('  # Create a GitHub repository and push'));
        }

        if (options.infrastructure) {
          logger.info(chalk.cyan('  # Configure your cloud credentials'));
          logger.info(chalk.cyan('  npm run infra:init'));
        }

        logger.info('\n' + chalk.bold('Available commands:'));
        logger.info(chalk.gray('  npm run dev') + ' - Start development server');
        logger.info(chalk.gray('  npm run build') + ' - Build for production');
        logger.info(chalk.gray('  npm run test') + ' - Run tests');
        
        if (options.gitops) {
          logger.info(chalk.gray('  npm run ci:setup') + ' - Set up CI/CD');
        }
        
        if (options.infrastructure) {
          logger.info(chalk.gray('  npm run infra:plan') + ' - Plan infrastructure changes');
          logger.info(chalk.gray('  npm run infra:apply') + ' - Apply infrastructure changes');
        }

        if (options.kubernetes) {
          logger.info(chalk.gray('  npm run k8s:deploy') + ' - Deploy to Kubernetes');
        }

        logger.info('\n' + chalk.green('Happy coding! 🎉\n'));

      } catch (error) {
        spinner.fail(chalk.red('Failed to create project'));
        logger.error('Project creation failed', error instanceof Error ? error : new Error(String(error)));
        process.exit(1);
      }
    });

  await program.parseAsync(process.argv);
}

function getTemplateDefaults(template: string): Partial<CreateOptions> {
  const templates: Record<string, Partial<CreateOptions>> = {
    'full-stack': {
      typescript: true,
      gitops: true,
      monorepo: true,
      infrastructure: true,
      cloud: 'aws',
      kubernetes: true,
      observability: true,
      security: true,
    },
    'microservices': {
      typescript: true,
      gitops: true,
      monorepo: true,
      infrastructure: true,
      cloud: 'aws',
      kubernetes: true,
      observability: true,
      security: true,
    },
    'serverless': {
      typescript: true,
      gitops: true,
      monorepo: false,
      infrastructure: true,
      cloud: 'aws',
      kubernetes: false,
      observability: true,
      security: true,
    },
    'minimal': {
      typescript: true,
      gitops: false,
      monorepo: false,
      infrastructure: false,
      kubernetes: false,
      observability: false,
      security: false,
    },
  };

  return templates[template] || {};
}