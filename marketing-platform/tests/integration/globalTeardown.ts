import { cleanupTestDatabase, cleanupTestRedis } from './setup';
import { logger } from './utils/logger';

export default async () => {
  logger.info('Cleaning up test environment...');
  
  try {
    await cleanupTestDatabase();
    await cleanupTestRedis();
    logger.info('Test environment cleanup complete');
  } catch (error) {
    logger.error('Error during test cleanup:', error);
  }
};