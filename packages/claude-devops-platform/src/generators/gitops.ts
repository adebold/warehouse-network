import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { logger } from '../utils/logger';

export interface GitOpsOptions {
  typescript?: boolean;
  monorepo?: boolean;
  kubernetes?: boolean;
  security?: boolean;
  cloud?: 'aws' | 'gcp' | 'azure' | 'all';
}

export class GitOpsGenerator {
  constructor(
    private projectPath: string,
    private options: GitOpsOptions
  ) {}

  async generate(): Promise<void> {
    logger.debug('Generating GitOps configuration...');

    await this.generateGitHubWorkflows();
    await this.generateArgoCD();
    await this.generateBranchProtection();
    await this.generateReleaseConfig();
    await this.generateDependabot();
    await this.generateCodeOwners();
    await this.generatePullRequestTemplate();
    await this.generateIssueTemplates();
  }

  private async generateGitHubWorkflows(): Promise<void> {
    const workflowsPath = path.join(this.projectPath, '.github', 'workflows');
    await fs.ensureDir(workflowsPath);

    // Main CI/CD workflow
    await this.generateMainWorkflow(workflowsPath);
    
    // PR validation workflow
    await this.generatePRWorkflow(workflowsPath);
    
    // Release workflow
    await this.generateReleaseWorkflow(workflowsPath);
    
    // Security scanning workflow
    if (this.options.security) {
      await this.generateSecurityWorkflow(workflowsPath);
    }
    
    // Deployment workflows
    if (this.options.kubernetes) {
      await this.generateDeploymentWorkflow(workflowsPath);
    }
  }

  private async generateMainWorkflow(workflowsPath: string): Promise<void> {
    const workflow = {
      name: 'CI/CD Pipeline',
      on: {
        push: {
          branches: ['main', 'develop'],
          tags: ['v*.*.*'],
        },
        workflow_dispatch: {},
      },
      env: {
        NODE_VERSION: '20.x',
        REGISTRY: 'ghcr.io',
        IMAGE_NAME: '${{ github.repository }}',
      },
      jobs: {
        test: {
          name: 'Test',
          'runs-on': 'ubuntu-latest',
          steps: [
            {
              name: 'Checkout',
              uses: 'actions/checkout@v4',
            },
            {
              name: 'Setup Node.js',
              uses: 'actions/setup-node@v4',
              with: {
                'node-version': '${{ env.NODE_VERSION }}',
                cache: 'npm',
              },
            },
            {
              name: 'Install dependencies',
              run: 'npm ci',
            },
            {
              name: 'Lint',
              run: 'npm run lint',
            },
            {
              name: 'Type check',
              run: 'npm run type-check',
              if: this.options.typescript,
            },
            {
              name: 'Test',
              run: 'npm test -- --coverage',
            },
            {
              name: 'Upload coverage',
              uses: 'codecov/codecov-action@v3',
              with: {
                token: '${{ secrets.CODECOV_TOKEN }}',
                files: './coverage/lcov.info',
              },
            },
          ],
        },
        build: {
          name: 'Build',
          'runs-on': 'ubuntu-latest',
          needs: ['test'],
          steps: [
            {
              name: 'Checkout',
              uses: 'actions/checkout@v4',
            },
            {
              name: 'Setup Node.js',
              uses: 'actions/setup-node@v4',
              with: {
                'node-version': '${{ env.NODE_VERSION }}',
                cache: 'npm',
              },
            },
            {
              name: 'Install dependencies',
              run: 'npm ci',
            },
            {
              name: 'Build',
              run: 'npm run build',
            },
            {
              name: 'Upload artifacts',
              uses: 'actions/upload-artifact@v3',
              with: {
                name: 'dist',
                path: 'dist/',
              },
            },
          ],
        },
        docker: {
          name: 'Build and Push Docker Image',
          'runs-on': 'ubuntu-latest',
          needs: ['build'],
          permissions: {
            contents: 'read',
            packages: 'write',
          },
          steps: [
            {
              name: 'Checkout',
              uses: 'actions/checkout@v4',
            },
            {
              name: 'Set up Docker Buildx',
              uses: 'docker/setup-buildx-action@v3',
            },
            {
              name: 'Log in to Container Registry',
              uses: 'docker/login-action@v3',
              with: {
                registry: '${{ env.REGISTRY }}',
                username: '${{ github.actor }}',
                password: '${{ secrets.GITHUB_TOKEN }}',
              },
            },
            {
              name: 'Extract metadata',
              id: 'meta',
              uses: 'docker/metadata-action@v5',
              with: {
                images: '${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}',
                tags: [
                  'type=ref,event=branch',
                  'type=ref,event=pr',
                  'type=semver,pattern={{version}}',
                  'type=semver,pattern={{major}}.{{minor}}',
                  'type=sha',
                ],
              },
            },
            {
              name: 'Build and push Docker image',
              uses: 'docker/build-push-action@v5',
              with: {
                context: '.',
                platforms: 'linux/amd64,linux/arm64',
                push: true,
                tags: '${{ steps.meta.outputs.tags }}',
                labels: '${{ steps.meta.outputs.labels }}',
                cache_from: 'type=gha',
                cache_to: 'type=gha,mode=max',
              },
            },
          ],
        },
      },
    };

    await fs.writeFile(
      path.join(workflowsPath, 'ci-cd.yml'),
      yaml.dump(workflow, { lineWidth: -1 })
    );
  }

  private async generatePRWorkflow(workflowsPath: string): Promise<void> {
    const workflow = {
      name: 'Pull Request Validation',
      on: {
        pull_request: {
          types: ['opened', 'synchronize', 'reopened'],
        },
      },
      jobs: {
        validate: {
          name: 'Validate PR',
          'runs-on': 'ubuntu-latest',
          steps: [
            {
              name: 'Checkout',
              uses: 'actions/checkout@v4',
              with: {
                'fetch-depth': 0,
              },
            },
            {
              name: 'Setup Node.js',
              uses: 'actions/setup-node@v4',
              with: {
                'node-version': '20.x',
                cache: 'npm',
              },
            },
            {
              name: 'Install dependencies',
              run: 'npm ci',
            },
            {
              name: 'Check commit messages',
              uses: 'wagoid/commitlint-github-action@v5',
            },
            {
              name: 'Lint PR title',
              uses: 'amannn/action-semantic-pull-request@v5',
              env: {
                GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
              },
            },
            {
              name: 'Run tests',
              run: 'npm test',
            },
            {
              name: 'Check code coverage',
              run: 'npm test -- --coverage --coverageReporters=text-summary',
            },
            {
              name: 'Size limit',
              uses: 'andresz1/size-limit-action@v1',
              with: {
                github_token: '${{ secrets.GITHUB_TOKEN }}',
                skip_step: 'install',
              },
              if: this.options.monorepo,
            },
          ],
        },
        'dependency-review': {
          name: 'Dependency Review',
          'runs-on': 'ubuntu-latest',
          steps: [
            {
              name: 'Checkout',
              uses: 'actions/checkout@v4',
            },
            {
              name: 'Dependency Review',
              uses: 'actions/dependency-review-action@v3',
            },
          ],
        },
      },
    };

    await fs.writeFile(
      path.join(workflowsPath, 'pr-validation.yml'),
      yaml.dump(workflow, { lineWidth: -1 })
    );
  }

  private async generateReleaseWorkflow(workflowsPath: string): Promise<void> {
    const workflow = {
      name: 'Release',
      on: {
        push: {
          branches: ['main'],
        },
      },
      permissions: {
        contents: 'write',
        'pull-requests': 'write',
        packages: 'write',
      },
      jobs: {
        release: {
          name: 'Release',
          'runs-on': 'ubuntu-latest',
          steps: [
            {
              name: 'Checkout',
              uses: 'actions/checkout@v4',
              with: {
                'fetch-depth': 0,
                'persist-credentials': false,
              },
            },
            {
              name: 'Setup Node.js',
              uses: 'actions/setup-node@v4',
              with: {
                'node-version': '20.x',
                cache: 'npm',
              },
            },
            {
              name: 'Install dependencies',
              run: 'npm ci',
            },
            ...(this.options.monorepo ? [
              {
                name: 'Create Release Pull Request',
                uses: 'changesets/action@v1',
                with: {
                  publish: 'npm run release',
                },
                env: {
                  GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
                  NPM_TOKEN: '${{ secrets.NPM_TOKEN }}',
                },
              },
            ] : [
              {
                name: 'Semantic Release',
                env: {
                  GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
                  NPM_TOKEN: '${{ secrets.NPM_TOKEN }}',
                },
                run: 'npx semantic-release',
              },
            ]),
          ],
        },
      },
    };

    await fs.writeFile(
      path.join(workflowsPath, 'release.yml'),
      yaml.dump(workflow, { lineWidth: -1 })
    );
  }

  private async generateSecurityWorkflow(workflowsPath: string): Promise<void> {
    const workflow = {
      name: 'Security Scanning',
      on: {
        push: {
          branches: ['main', 'develop'],
        },
        pull_request: {
          branches: ['main'],
        },
        schedule: [
          {
            cron: '0 0 * * 1', // Weekly on Monday
          },
        ],
      },
      jobs: {
        'dependency-check': {
          name: 'Dependency Security Check',
          'runs-on': 'ubuntu-latest',
          steps: [
            {
              name: 'Checkout',
              uses: 'actions/checkout@v4',
            },
            {
              name: 'Run npm audit',
              run: 'npm audit --audit-level=moderate',
            },
            {
              name: 'Run Snyk to check for vulnerabilities',
              uses: 'snyk/actions/node@master',
              env: {
                SNYK_TOKEN: '${{ secrets.SNYK_TOKEN }}',
              },
            },
          ],
        },
        codeql: {
          name: 'CodeQL Analysis',
          'runs-on': 'ubuntu-latest',
          permissions: {
            actions: 'read',
            contents: 'read',
            'security-events': 'write',
          },
          steps: [
            {
              name: 'Checkout',
              uses: 'actions/checkout@v4',
            },
            {
              name: 'Initialize CodeQL',
              uses: 'github/codeql-action/init@v2',
              with: {
                languages: 'javascript',
              },
            },
            {
              name: 'Autobuild',
              uses: 'github/codeql-action/autobuild@v2',
            },
            {
              name: 'Perform CodeQL Analysis',
              uses: 'github/codeql-action/analyze@v2',
            },
          ],
        },
        trivy: {
          name: 'Trivy Security Scan',
          'runs-on': 'ubuntu-latest',
          steps: [
            {
              name: 'Checkout',
              uses: 'actions/checkout@v4',
            },
            {
              name: 'Run Trivy vulnerability scanner',
              uses: 'aquasecurity/trivy-action@master',
              with: {
                'scan-type': 'fs',
                'scan-ref': '.',
                format: 'sarif',
                output: 'trivy-results.sarif',
              },
            },
            {
              name: 'Upload Trivy scan results',
              uses: 'github/codeql-action/upload-sarif@v2',
              with: {
                sarif_file: 'trivy-results.sarif',
              },
            },
          ],
        },
      },
    };

    await fs.writeFile(
      path.join(workflowsPath, 'security.yml'),
      yaml.dump(workflow, { lineWidth: -1 })
    );
  }

  private async generateDeploymentWorkflow(workflowsPath: string): Promise<void> {
    const workflow = {
      name: 'Deploy to Kubernetes',
      on: {
        push: {
          branches: ['main'],
          tags: ['v*.*.*'],
        },
        workflow_dispatch: {
          inputs: {
            environment: {
              description: 'Environment to deploy to',
              required: true,
              default: 'staging',
              type: 'choice',
              options: ['development', 'staging', 'production'],
            },
          },
        },
      },
      jobs: {
        deploy: {
          name: 'Deploy',
          'runs-on': 'ubuntu-latest',
          environment: '${{ github.event.inputs.environment || \'staging\' }}',
          steps: [
            {
              name: 'Checkout',
              uses: 'actions/checkout@v4',
            },
            {
              name: 'Configure kubectl',
              uses: 'azure/setup-kubectl@v3',
              with: {
                version: 'v1.28.0',
              },
            },
            {
              name: 'Set up Kustomize',
              run: `curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
sudo mv kustomize /usr/local/bin/`,
            },
            {
              name: 'Deploy to Kubernetes',
              env: {
                KUBECONFIG_FILE: '${{ secrets.KUBECONFIG }}',
                ENVIRONMENT: '${{ github.event.inputs.environment || \'staging\' }}',
              },
              run: `echo "$KUBECONFIG_FILE" | base64 -d > kubeconfig
export KUBECONFIG=kubeconfig
kustomize build k8s/overlays/$ENVIRONMENT | kubectl apply -f -
kubectl rollout status deployment/app -n $ENVIRONMENT`,
            },
          ],
        },
      },
    };

    await fs.writeFile(
      path.join(workflowsPath, 'deploy.yml'),
      yaml.dump(workflow, { lineWidth: -1 })
    );
  }

  private async generateArgoCD(): Promise<void> {
    const argoCDPath = path.join(this.projectPath, '.argocd');
    await fs.ensureDir(argoCDPath);

    // Application manifest
    const appManifest = {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Application',
      metadata: {
        name: path.basename(this.projectPath),
        namespace: 'argocd',
      },
      spec: {
        project: 'default',
        source: {
          repoURL: 'https://github.com/your-org/your-repo',
          targetRevision: 'HEAD',
          path: 'k8s/overlays/production',
        },
        destination: {
          server: 'https://kubernetes.default.svc',
          namespace: 'production',
        },
        syncPolicy: {
          automated: {
            prune: true,
            selfHeal: true,
            allowEmpty: false,
          },
          syncOptions: [
            'Validate=true',
            'CreateNamespace=true',
            'PrunePropagationPolicy=foreground',
            'PruneLast=true',
          ],
          retry: {
            limit: 5,
            backoff: {
              duration: '5s',
              factor: 2,
              maxDuration: '3m',
            },
          },
        },
      },
    };

    await fs.writeFile(
      path.join(argoCDPath, 'application.yaml'),
      yaml.dump(appManifest)
    );

    // AppProject for multi-tenant setups
    const projectManifest = {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'AppProject',
      metadata: {
        name: path.basename(this.projectPath),
        namespace: 'argocd',
      },
      spec: {
        description: 'Project for ' + path.basename(this.projectPath),
        sourceRepos: [
          'https://github.com/your-org/*',
        ],
        destinations: [
          {
            namespace: '*',
            server: 'https://kubernetes.default.svc',
          },
        ],
        clusterResourceWhitelist: [
          {
            group: '*',
            kind: '*',
          },
        ],
        namespaceResourceWhitelist: [
          {
            group: '*',
            kind: '*',
          },
        ],
      },
    };

    await fs.writeFile(
      path.join(argoCDPath, 'project.yaml'),
      yaml.dump(projectManifest)
    );
  }

  private async generateBranchProtection(): Promise<void> {
    const script = `#!/usr/bin/env node

const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const owner = process.env.GITHUB_REPOSITORY_OWNER || 'your-org';
const repo = process.env.GITHUB_REPOSITORY_NAME || '${path.basename(this.projectPath)}';

async function setupBranchProtection() {
  try {
    // Protect main branch
    await octokit.repos.updateBranchProtection({
      owner,
      repo,
      branch: 'main',
      required_status_checks: {
        strict: true,
        contexts: ['test', 'build', 'security/codeql'],
      },
      enforce_admins: true,
      required_pull_request_reviews: {
        required_approving_review_count: 1,
        dismiss_stale_reviews: true,
        require_code_owner_reviews: true,
        require_last_push_approval: true,
      },
      restrictions: null,
      allow_force_pushes: false,
      allow_deletions: false,
      block_creations: false,
      required_conversation_resolution: true,
    });

    logger.info('Branch protection rules applied successfully!');
  } catch (error) {
    logger.error('Failed to apply branch protection:', error.message);
    process.exit(1);
  }
}

setupBranchProtection();
`;

    const scriptsPath = path.join(this.projectPath, 'scripts');
    await fs.ensureDir(scriptsPath);
    await fs.writeFile(
      path.join(scriptsPath, 'setup-branch-protection.js'),
      script
    );
  }

  private async generateReleaseConfig(): Promise<void> {
    if (this.options.monorepo) {
      // Changesets configuration
      const changesetsPath = path.join(this.projectPath, '.changeset');
      await fs.ensureDir(changesetsPath);

      const config = {
        $schema: 'https://unpkg.com/@changesets/config@2.3.1/schema.json',
        changelog: '@changesets/cli/changelog',
        commit: false,
        fixed: [],
        linked: [],
        access: 'public',
        baseBranch: 'main',
        updateInternalDependencies: 'patch',
        ignore: [],
      };

      await fs.writeFile(
        path.join(changesetsPath, 'config.json'),
        JSON.stringify(config, null, 2)
      );

      await fs.writeFile(
        path.join(changesetsPath, 'README.md'),
        `# Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to manage versions and releases.

## Adding a changeset

Run \`npm run changeset\` and follow the prompts.
`
      );
    } else {
      // Semantic release configuration
      const releaseConfig = {
        branches: ['main'],
        plugins: [
          '@semantic-release/commit-analyzer',
          '@semantic-release/release-notes-generator',
          '@semantic-release/changelog',
          '@semantic-release/npm',
          '@semantic-release/github',
          [
            '@semantic-release/git',
            {
              assets: ['CHANGELOG.md', 'package.json'],
              message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
            },
          ],
        ],
      };

      await fs.writeFile(
        path.join(this.projectPath, '.releaserc.json'),
        JSON.stringify(releaseConfig, null, 2)
      );
    }
  }

  private async generateDependabot(): Promise<void> {
    const dependabotPath = path.join(this.projectPath, '.github');
    await fs.ensureDir(dependabotPath);

    const config = {
      version: 2,
      updates: [
        {
          'package-ecosystem': 'npm',
          directory: '/',
          schedule: {
            interval: 'weekly',
            day: 'monday',
            time: '04:00',
          },
          open_pull_requests_limit: 10,
          reviewers: ['your-github-username'],
          labels: ['dependencies'],
          commit_message: {
            prefix: 'fix',
            prefix_development: 'chore',
            include_scope: true,
          },
        },
        {
          'package-ecosystem': 'github-actions',
          directory: '/',
          schedule: {
            interval: 'weekly',
          },
          labels: ['github-actions'],
        },
        {
          'package-ecosystem': 'docker',
          directory: '/',
          schedule: {
            interval: 'weekly',
          },
          labels: ['docker'],
        },
      ],
    };

    if (this.options.kubernetes) {
      config.updates.push({
        'package-ecosystem': 'docker',
        directory: '/k8s',
        schedule: {
          interval: 'weekly',
        },
        labels: ['kubernetes', 'docker'],
      });
    }

    await fs.writeFile(
      path.join(dependabotPath, 'dependabot.yml'),
      yaml.dump(config)
    );
  }

  private async generateCodeOwners(): Promise<void> {
    const codeowners = `# Code Owners
# https://help.github.com/articles/about-code-owners/

# Global owners
* @your-github-username

# Frontend
/src/frontend/ @frontend-team
/packages/ui/ @frontend-team

# Backend
/src/backend/ @backend-team
/packages/api/ @backend-team

# Infrastructure
/infrastructure/ @devops-team
/terraform/ @devops-team
/k8s/ @devops-team
/.github/workflows/ @devops-team

# Documentation
/docs/ @documentation-team
*.md @documentation-team

# Security
/security/ @security-team
.github/workflows/security.yml @security-team
`;

    await fs.writeFile(
      path.join(this.projectPath, '.github', 'CODEOWNERS'),
      codeowners
    );
  }

  private async generatePullRequestTemplate(): Promise<void> {
    const template = `## Description

Please provide a brief description of the changes in this PR.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactoring

## Related Issues

Fixes #(issue_number)

## Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Test coverage maintained or improved

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published in downstream modules

## Screenshots (if applicable)

Please add screenshots to help explain your changes.

## Additional Notes

Any additional information that reviewers should know.
`;

    await fs.writeFile(
      path.join(this.projectPath, '.github', 'pull_request_template.md'),
      template
    );
  }

  private async generateIssueTemplates(): Promise<void> {
    const templatesPath = path.join(this.projectPath, '.github', 'ISSUE_TEMPLATE');
    await fs.ensureDir(templatesPath);

    // Bug report template
    const bugReport = {
      name: 'Bug Report',
      about: 'Create a report to help us improve',
      title: '[BUG] ',
      labels: ['bug', 'triage'],
      assignees: [],
      body: [
        {
          type: 'markdown',
          attributes: {
            value: '## Bug Description',
          },
        },
        {
          type: 'textarea',
          id: 'description',
          attributes: {
            label: 'Describe the bug',
            description: 'A clear and concise description of what the bug is.',
            placeholder: 'Tell us what happened',
          },
          validations: {
            required: true,
          },
        },
        {
          type: 'textarea',
          id: 'reproduction',
          attributes: {
            label: 'Steps to Reproduce',
            description: 'Steps to reproduce the behavior',
            value: `1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error`,
          },
          validations: {
            required: true,
          },
        },
        {
          type: 'textarea',
          id: 'expected',
          attributes: {
            label: 'Expected behavior',
            description: 'A clear and concise description of what you expected to happen.',
          },
          validations: {
            required: true,
          },
        },
        {
          type: 'dropdown',
          id: 'severity',
          attributes: {
            label: 'Severity',
            options: [
              'Critical - System is unusable',
              'High - Major feature broken',
              'Medium - Minor feature broken',
              'Low - Cosmetic issue',
            ],
          },
          validations: {
            required: true,
          },
        },
        {
          type: 'input',
          id: 'version',
          attributes: {
            label: 'Version',
            description: 'What version of our software are you running?',
          },
          validations: {
            required: true,
          },
        },
      ],
    };

    await fs.writeFile(
      path.join(templatesPath, 'bug_report.yml'),
      yaml.dump(bugReport)
    );

    // Feature request template
    const featureRequest = {
      name: 'Feature Request',
      about: 'Suggest an idea for this project',
      title: '[FEATURE] ',
      labels: ['enhancement'],
      assignees: [],
      body: [
        {
          type: 'markdown',
          attributes: {
            value: '## Feature Request',
          },
        },
        {
          type: 'textarea',
          id: 'problem',
          attributes: {
            label: 'Is your feature request related to a problem?',
            description: 'A clear and concise description of what the problem is.',
            placeholder: "Ex. I'm always frustrated when...",
          },
          validations: {
            required: true,
          },
        },
        {
          type: 'textarea',
          id: 'solution',
          attributes: {
            label: 'Describe the solution you\'d like',
            description: 'A clear and concise description of what you want to happen.',
          },
          validations: {
            required: true,
          },
        },
        {
          type: 'textarea',
          id: 'alternatives',
          attributes: {
            label: 'Describe alternatives you\'ve considered',
            description: 'A clear and concise description of any alternative solutions or features you\'ve considered.',
          },
        },
        {
          type: 'checkboxes',
          id: 'terms',
          attributes: {
            label: 'Confirmation',
            options: [
              {
                label: 'I have searched for existing feature requests',
                required: true,
              },
            ],
          },
        },
      ],
    };

    await fs.writeFile(
      path.join(templatesPath, 'feature_request.yml'),
      yaml.dump(featureRequest)
    );
  }
}