/**
 * AI Platform Startup Script
 */

import { config } from 'dotenv';
import { logger } from '@/utils/logger';
import { AIAPIServer } from '@/api/server';

// Load environment configuration
config();

async function startServer(): Promise<void> {
  const port = parseInt(process.env.PORT || '3001');

  try {
    logger.info('🚀 Starting AI/ML Platform...');

    const server = new AIAPIServer();
    await server.start(port);

    logger.info(`✅ AI/ML Platform ready at http://localhost:${port}`);
    logger.info(`📊 Health: http://localhost:${port}/api/v1/health`);
    logger.info(`📖 Docs: http://localhost:${port}/api/v1/docs`);
  } catch (error) {
    logger.error('❌ Failed to start AI platform:', error);
    process.exit(1);
  }
}

// Start the server
startServer();