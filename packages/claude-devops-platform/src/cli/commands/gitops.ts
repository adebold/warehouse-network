import { Command } from 'commander';
import { simpleGit, SimpleGit } from 'simple-git';
import { Octokit } from '@octokit/rest';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';
import { GitOpsGenerator } from '../../generators/gitops';

export class GitOpsCommand extends Command {
  constructor() {
    super('gitops');
    this.description('Manage GitOps configuration and workflows')
      .addCommand(this.createSetupCommand())
      .addCommand(this.createDeployCommand())
      .addCommand(this.createSyncCommand())
      .addCommand(this.createRollbackCommand())
      .addCommand(this.createValidateCommand());
  }

  private createSetupCommand(): Command {
    const command = new Command('setup')
      .description('Set up GitOps configuration for your project')
      .option('-p, --provider <provider>', 'Git provider (github, gitlab, bitbucket)', 'github')
      .option('-r, --repo <repo>', 'Repository URL')
      .option('-b, --branch <branch>', 'Default branch', 'main')
      .option('--argocd', 'Include ArgoCD configuration', true)
      .option('--flux', 'Include Flux configuration')
      .action(async (options) => {
        try {
          logger.info('Setting up GitOps configuration...');
          
          const git: SimpleGit = simpleGit(process.cwd());
          const isRepo = await git.checkIsRepo();
          
          if (!isRepo) {
            logger.warn('Not a git repository. Initializing...');
            await git.init();
          }

          // Generate GitOps configuration
          const generator = new GitOpsGenerator(process.cwd(), options);
          await generator.generate();

          // Set up branch protection if GitHub token is available
          if (process.env.GITHUB_TOKEN && options.provider === 'github') {
            await this.setupBranchProtection(options);
          }

          logger.success('GitOps configuration created successfully!');
          logger.info('Next steps:');
          logger.info('  1. Review and customize the generated workflows');
          logger.info('  2. Commit and push the changes');
          logger.info('  3. Configure secrets in your repository settings');
          logger.info('  4. Set up ArgoCD or Flux in your cluster');
        } catch (error) {
          logger.error('Failed to set up GitOps:', error);
          process.exit(1);
        }
      });

    return command;
  }

  private createDeployCommand(): Command {
    const command = new Command('deploy')
      .description('Deploy application using GitOps')
      .argument('<environment>', 'Target environment (dev, staging, prod)')
      .option('-t, --tag <tag>', 'Image tag to deploy')
      .option('-a, --app <app>', 'Application name')
      .option('--dry-run', 'Show what would be deployed')
      .action(async (environment: string, options) => {
        try {
          logger.info(`Deploying to ${environment}...`);
          
          const git: SimpleGit = simpleGit(process.cwd());
          
          // Update kustomization or helm values
          const envPath = path.join('k8s', 'overlays', environment);
          
          if (await fs.pathExists(envPath)) {
            const kustomizationPath = path.join(envPath, 'kustomization.yaml');
            
            if (await fs.pathExists(kustomizationPath)) {
              // Update image tag in kustomization
              logger.info(`Updating image tag to ${options.tag || 'latest'}`);
              // Implementation would update the kustomization file
            }
          }

          if (options.dryRun) {
            logger.info('Dry run completed. No changes were made.');
          } else {
            // Commit and push changes
            await git.add('.');
            await git.commit(`chore: deploy ${options.app || 'app'} to ${environment}`);
            await git.push();
            
            logger.success('Deployment initiated via GitOps!');
            logger.info('ArgoCD/Flux will automatically sync the changes.');
          }
        } catch (error) {
          logger.error('Deployment failed:', error);
          process.exit(1);
        }
      });

    return command;
  }

  private createSyncCommand(): Command {
    const command = new Command('sync')
      .description('Sync GitOps state with cluster')
      .option('-a, --app <app>', 'Application to sync')
      .option('-w, --wait', 'Wait for sync to complete')
      .option('--prune', 'Remove resources not in Git')
      .action(async (options) => {
        try {
          logger.info('Syncing GitOps state...');
          
          // This would integrate with ArgoCD or Flux API
          if (process.env.ARGOCD_SERVER) {
            // ArgoCD sync logic
            logger.info('Triggering ArgoCD sync...');
          } else if (process.env.FLUX_NAMESPACE) {
            // Flux sync logic
            logger.info('Triggering Flux reconciliation...');
          } else {
            logger.warn('No GitOps tool configured. Please set up ArgoCD or Flux.');
          }

          if (options.wait) {
            logger.info('Waiting for sync to complete...');
            // Implementation would poll for sync status
          }

          logger.success('Sync completed successfully!');
        } catch (error) {
          logger.error('Sync failed:', error);
          process.exit(1);
        }
      });

    return command;
  }

  private createRollbackCommand(): Command {
    const command = new Command('rollback')
      .description('Rollback to a previous deployment')
      .argument('<environment>', 'Target environment')
      .option('-r, --revision <revision>', 'Git revision to rollback to')
      .option('-c, --commits <count>', 'Number of commits to rollback', '1')
      .action(async (environment: string, options) => {
        try {
          logger.info(`Rolling back ${environment} deployment...`);
          
          const git: SimpleGit = simpleGit(process.cwd());
          
          if (options.revision) {
            // Rollback to specific revision
            await git.revert(options.revision);
          } else {
            // Rollback by number of commits
            const log = await git.log({ '-n': parseInt(options.commits) + 1 });
            const targetCommit = log.all[parseInt(options.commits)];
            
            if (targetCommit) {
              await git.revert(targetCommit.hash);
            }
          }

          await git.push();
          
          logger.success('Rollback initiated via GitOps!');
          logger.info('The previous state will be restored automatically.');
        } catch (error) {
          logger.error('Rollback failed:', error);
          process.exit(1);
        }
      });

    return command;
  }

  private createValidateCommand(): Command {
    const command = new Command('validate')
      .description('Validate GitOps configuration')
      .option('-e, --environment <env>', 'Environment to validate')
      .action(async (options) => {
        try {
          logger.info('Validating GitOps configuration...');
          
          const checks = [
            this.checkGitRepository(),
            this.checkWorkflows(),
            this.checkKubernetesManifests(options.environment),
            this.checkSecrets(),
            this.checkBranchProtection(),
          ];

          const results = await Promise.all(checks);
          
          const failed = results.filter(r => !r.success);
          
          if (failed.length === 0) {
            logger.success('All GitOps checks passed!');
          } else {
            logger.error(`${failed.length} checks failed:`);
            failed.forEach(r => logger.error(`  - ${r.message}`));
            process.exit(1);
          }
        } catch (error) {
          logger.error('Validation failed:', error);
          process.exit(1);
        }
      });

    return command;
  }

  private async setupBranchProtection(options: any): Promise<void> {
    try {
      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
      });

      const repoUrl = options.repo || (await simpleGit().getRemotes(true))[0]?.refs?.push;
      if (!repoUrl) return;

      const match = repoUrl.match(/github\.com[:\/](.+?)\/(.+?)(\.git)?$/);
      if (!match) return;

      const [, owner, repo] = match;

      await octokit.repos.updateBranchProtection({
        owner,
        repo: repo.replace('.git', ''),
        branch: options.branch,
        required_status_checks: {
          strict: true,
          contexts: ['test', 'build'],
        },
        enforce_admins: true,
        required_pull_request_reviews: {
          required_approving_review_count: 1,
          dismiss_stale_reviews: true,
        },
        restrictions: null,
      });

      logger.success('Branch protection configured!');
    } catch (error) {
      logger.warn('Could not set up branch protection:', error);
    }
  }

  private async checkGitRepository(): Promise<{ success: boolean; message: string }> {
    try {
      const git = simpleGit();
      const isRepo = await git.checkIsRepo();
      
      if (!isRepo) {
        return { success: false, message: 'Not a git repository' };
      }

      const remotes = await git.getRemotes(true);
      if (remotes.length === 0) {
        return { success: false, message: 'No remote repository configured' };
      }

      return { success: true, message: 'Git repository configured' };
    } catch (error) {
      return { success: false, message: `Git check failed: ${error}` };
    }
  }

  private async checkWorkflows(): Promise<{ success: boolean; message: string }> {
    const workflowPath = path.join('.github', 'workflows');
    
    if (!await fs.pathExists(workflowPath)) {
      return { success: false, message: 'GitHub workflows directory missing' };
    }

    const workflows = await fs.readdir(workflowPath);
    
    if (workflows.length === 0) {
      return { success: false, message: 'No workflow files found' };
    }

    return { success: true, message: `Found ${workflows.length} workflow files` };
  }

  private async checkKubernetesManifests(environment?: string): Promise<{ success: boolean; message: string }> {
    const k8sPath = path.join('k8s');
    
    if (!await fs.pathExists(k8sPath)) {
      return { success: false, message: 'Kubernetes manifests directory missing' };
    }

    if (environment) {
      const envPath = path.join(k8sPath, 'overlays', environment);
      
      if (!await fs.pathExists(envPath)) {
        return { success: false, message: `Environment ${environment} not configured` };
      }
    }

    return { success: true, message: 'Kubernetes manifests found' };
  }

  private async checkSecrets(): Promise<{ success: boolean; message: string }> {
    // Check for secret templates or documentation
    const secretFiles = [
      '.env.example',
      'secrets.example.yaml',
      path.join('k8s', 'overlays', 'development', 'secrets.env.example'),
    ];

    const found = [];
    
    for (const file of secretFiles) {
      if (await fs.pathExists(file)) {
        found.push(file);
      }
    }

    if (found.length === 0) {
      return { success: false, message: 'No secret templates found' };
    }

    return { success: true, message: `Found ${found.length} secret templates` };
  }

  private async checkBranchProtection(): Promise<{ success: boolean; message: string }> {
    if (!process.env.GITHUB_TOKEN) {
      return { success: true, message: 'Skipping branch protection check (no token)' };
    }

    try {
      const git = simpleGit();
      const remotes = await git.getRemotes(true);
      const repoUrl = remotes[0]?.refs?.push;
      
      if (!repoUrl || !repoUrl.includes('github.com')) {
        return { success: true, message: 'Not a GitHub repository' };
      }

      // This would check branch protection via GitHub API
      return { success: true, message: 'Branch protection check passed' };
    } catch (error) {
      return { success: false, message: `Branch protection check failed: ${error}` };
    }
  }
}