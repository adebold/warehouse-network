import fs from 'fs-extra';
import path from 'path';
import { logger } from '../../utils/logger';
import { GitOpsGenerator } from '../../generators/gitops';
import { MonorepoGenerator } from '../../generators/monorepo';
import { InfrastructureGenerator } from '../../generators/infrastructure';

export async function initializePlatform(projectPath: string, options: any): Promise<void> {
  logger.info('Initializing Claude Platform features...');

  if (options.gitops) {
    const gitopsGen = new GitOpsGenerator(projectPath, options);
    await gitopsGen.generate();
    logger.success('GitOps configuration added!');
  }

  if (options.monorepo) {
    const monorepoGen = new MonorepoGenerator(projectPath, options);
    await monorepoGen.generate();
    logger.success('Monorepo structure added!');
  }

  if (options.infrastructure) {
    const infraGen = new InfrastructureGenerator(projectPath, options);
    await infraGen.generate();
    logger.success('Infrastructure code added!');
  }

  if (options.kubernetes) {
    // Kubernetes is handled by infrastructure generator
    logger.info('Kubernetes configuration included with infrastructure.');
  }

  if (options.observability) {
    // Observability is handled by infrastructure generator
    logger.info('Observability stack included with infrastructure.');
  }

  if (options.security) {
    // Add security scanning configuration
    await addSecurityScanning(projectPath);
    logger.success('Security scanning configuration added!');
  }

  logger.success('Claude Platform initialized successfully!');
}

async function addSecurityScanning(projectPath: string): Promise<void> {
  // Add .trivyignore
  const trivyIgnore = `# Trivy ignore file
# https://aquasecurity.github.io/trivy/latest/docs/vulnerability/examples/filter/

# Ignore unfixed vulnerabilities
# UNFIXED

# Ignore specific CVEs
# CVE-2021-12345
`;

  await fs.writeFile(path.join(projectPath, '.trivyignore'), trivyIgnore);

  // Add semgrep configuration
  const semgrepConfig = {
    rules: [],
    paths: {
      include: ['src/', 'apps/', 'packages/', 'libs/'],
      exclude: ['node_modules/', 'dist/', 'build/', 'coverage/'],
    },
  };

  await fs.writeFile(
    path.join(projectPath, '.semgrep.yml'),
    require('js-yaml').dump(semgrepConfig)
  );
}