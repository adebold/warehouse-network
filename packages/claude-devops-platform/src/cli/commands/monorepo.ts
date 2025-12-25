import { Command } from 'commander';
import { logger } from '../../utils/logger';
import { MonorepoGenerator } from '../../generators/monorepo';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';

export class MonorepoCommand extends Command {
  constructor() {
    super('monorepo');
    this.description('Manage monorepo structure and dependencies')
      .addCommand(this.createInitCommand())
      .addCommand(this.createAddCommand())
      .addCommand(this.createRunCommand())
      .addCommand(this.createGraphCommand());
  }

  private createInitCommand(): Command {
    return new Command('init')
      .description('Initialize monorepo structure')
      .option('-t, --tool <tool>', 'Monorepo tool (nx, lerna, turbo)', 'turbo')
      .option('--pnpm', 'Use pnpm workspaces')
      .option('--yarn', 'Use yarn workspaces')
      .action(async (options) => {
        try {
          logger.info('Initializing monorepo structure...');
          const generator = new MonorepoGenerator(process.cwd(), options);
          await generator.generate();
          logger.success('Monorepo initialized successfully!');
        } catch (error) {
          logger.error('Failed to initialize monorepo:', error);
          process.exit(1);
        }
      });
  }

  private createAddCommand(): Command {
    return new Command('add')
      .description('Add a new package to the monorepo')
      .argument('<name>', 'Package name')
      .option('-t, --type <type>', 'Package type (app, lib, package)', 'package')
      .option('--template <template>', 'Use a specific template')
      .action(async (name: string, options) => {
        try {
          logger.info(`Adding new ${options.type}: ${name}...`);
          
          const targetDir = path.join(
            process.cwd(),
            options.type === 'app' ? 'apps' : options.type === 'lib' ? 'libs' : 'packages',
            name
          );

          await fs.ensureDir(targetDir);
          
          // Create package.json
          const packageJson = {
            name: `@monorepo/${name}`,
            version: '0.0.0',
            private: options.type === 'app',
            main: options.type !== 'app' ? 'dist/index.js' : undefined,
            types: options.type !== 'app' ? 'dist/index.d.ts' : undefined,
            scripts: {
              build: 'tsc',
              dev: 'tsc --watch',
              test: 'jest',
            },
          };

          await fs.writeJson(path.join(targetDir, 'package.json'), packageJson, { spaces: 2 });
          
          // Create source directory
          await fs.ensureDir(path.join(targetDir, 'src'));
          await fs.writeFile(
            path.join(targetDir, 'src', 'index.ts'),
            `export const ${name} = '${name}';
`
          );

          logger.success(`Package ${name} created successfully!`);
        } catch (error) {
          logger.error('Failed to add package:', error);
          process.exit(1);
        }
      });
  }

  private createRunCommand(): Command {
    return new Command('run')
      .description('Run commands across packages')
      .argument('<command>', 'Command to run')
      .option('-f, --filter <filter>', 'Filter packages')
      .option('-p, --parallel', 'Run in parallel')
      .action(async (command: string, options) => {
        try {
          logger.info(`Running '${command}' across packages...`);
          
          // Detect which tool to use
          if (await fs.pathExists('turbo.json')) {
            const args = ['run', command];
            if (options.filter) args.push('--filter', options.filter);
            if (!options.parallel) args.push('--concurrency', '1');
            
            await execa('turbo', args, { stdio: 'inherit' });
          } else if (await fs.pathExists('nx.json')) {
            await execa('nx', ['run-many', '--target', command], { stdio: 'inherit' });
          } else {
            await execa('npm', ['run', command, '--workspaces'], { stdio: 'inherit' });
          }

          logger.success('Command completed successfully!');
        } catch (error) {
          logger.error('Command failed:', error);
          process.exit(1);
        }
      });
  }

  private createGraphCommand(): Command {
    return new Command('graph')
      .description('Visualize package dependencies')
      .action(async () => {
        try {
          logger.info('Generating dependency graph...');
          
          if (await fs.pathExists('nx.json')) {
            await execa('nx', ['graph'], { stdio: 'inherit' });
          } else {
            logger.info('Install nx to visualize dependencies: npm install -D nx');
          }
        } catch (error) {
          logger.error('Failed to generate graph:', error);
        }
      });
  }
}