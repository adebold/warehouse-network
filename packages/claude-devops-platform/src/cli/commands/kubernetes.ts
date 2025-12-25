import { Command } from 'commander';
import { logger } from '../../utils/logger';

export class KubernetesCommand extends Command {
  constructor() {
    super('k8s');
    this.description('Manage Kubernetes deployments and configurations');
  }
}