import { setupTestDatabase, setupTestRedis } from './setup';
import { logger } from './utils/logger';

export default async () => {
  logger.info('Setting up test databases...');
  
  try {
    // Setup PostgreSQL test database
    await setupTestDatabase();
    logger.info('PostgreSQL test database ready');
    
    // Setup Redis test instance
    await setupTestRedis();
    logger.info('Redis test instance ready');
    
    logger.info('Test environment setup complete');
  } catch (error) {
    logger.error('Failed to setup test environment:', error);
    process.exit(1);
  }
};