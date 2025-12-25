import { Command } from 'commander';
import { logger } from '../../utils/logger';

export class InfrastructureCommand extends Command {
  constructor() {
    super('infra');
    this.description('Manage infrastructure as code');
  }
}