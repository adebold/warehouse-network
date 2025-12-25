import { Command } from 'commander';
import { logger } from '../../utils/logger';

export class ObservabilityCommand extends Command {
  constructor() {
    super('observability');
    this.description('Set up and manage observability stack');
  }
}