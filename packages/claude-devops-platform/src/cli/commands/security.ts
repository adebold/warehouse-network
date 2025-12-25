import { Command } from 'commander';
import { logger } from '../../utils/logger';

export class SecurityCommand extends Command {
  constructor() {
    super('security');
    this.description('Security scanning and vulnerability management');
  }
}