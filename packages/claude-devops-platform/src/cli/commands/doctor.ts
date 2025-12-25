import { execa } from 'execa';
import { logger } from '../../utils/logger';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';

interface DoctorCheck {
  name: string;
  check: () => Promise<boolean>;
  fix?: () => Promise<void>;
  required: boolean;
}

export async function runDoctor(): Promise<void> {
  logger.info('Running Claude Platform doctor...');

  const checks: DoctorCheck[] = [
    {
      name: 'Node.js version',
      check: checkNodeVersion,
      required: true,
    },
    {
      name: 'Git installed',
      check: checkGit,
      required: true,
    },
    {
      name: 'Docker installed',
      check: checkDocker,
      required: false,
    },
    {
      name: 'Kubernetes CLI',
      check: checkKubectl,
      required: false,
    },
    {
      name: 'Terraform installed',
      check: checkTerraform,
      required: false,
    },
    {
      name: 'AWS CLI',
      check: checkAwsCli,
      required: false,
    },
    {
      name: 'GitHub CLI',
      check: checkGitHubCli,
      required: false,
    },
  ];

  let failed = 0;
  let warnings = 0;

  for (const check of checks) {
    try {
      const passed = await check.check();
      
      if (passed) {
        logger.success(`✓ ${check.name}`);
      } else if (check.required) {
        logger.fail(`✗ ${check.name} (required)`);
        failed++;
      } else {
        logger.warn(`⚠ ${check.name} (optional)`);
        warnings++;
      }
    } catch (error) {
      if (check.required) {
        logger.fail(`✗ ${check.name}: ${error}`);
        failed++;
      } else {
        logger.warn(`⚠ ${check.name}: ${error}`);
        warnings++;
      }
    }
  }

  console.log('');
  
  if (failed > 0) {
    logger.error(`${failed} required checks failed.`);
    logger.info('Please install missing dependencies before continuing.');
    process.exit(1);
  } else if (warnings > 0) {
    logger.warn(`${warnings} optional checks failed.`);
    logger.info('Some features may not be available.');
  } else {
    logger.success('All checks passed!');
  }
}

async function checkNodeVersion(): Promise<boolean> {
  const version = process.version;
  const minVersion = '18.0.0';
  
  if (!semver.gte(version, minVersion)) {
    throw new Error(`Node.js ${minVersion} or higher required (found ${version})`);
  }
  
  return true;
}

async function checkGit(): Promise<boolean> {
  try {
    await execa('git', ['--version']);
    return true;
  } catch {
    throw new Error('Git is not installed');
  }
}

async function checkDocker(): Promise<boolean> {
  try {
    await execa('docker', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function checkKubectl(): Promise<boolean> {
  try {
    await execa('kubectl', ['version', '--client', '--short']);
    return true;
  } catch {
    return false;
  }
}

async function checkTerraform(): Promise<boolean> {
  try {
    await execa('terraform', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function checkAwsCli(): Promise<boolean> {
  try {
    await execa('aws', ['--version']);
    return true;
  } catch {
    return false;
  }
}

async function checkGitHubCli(): Promise<boolean> {
  try {
    await execa('gh', ['--version']);
    return true;
  } catch {
    return false;
  }
}