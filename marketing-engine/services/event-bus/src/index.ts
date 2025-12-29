import { EventBus } from './event-bus';
import { KafkaProducer } from './kafka/producer';
import { KafkaConsumer } from './kafka/consumer';
import { RedisStreams } from './redis/streams';
import { EventStore } from './event-store';
import { logger } from './utils/logger';
import { config } from './config';

async function start() {
  try {
    logger.info('Starting Event Bus service...');

    // Initialize components
    const kafkaProducer = new KafkaProducer();
    const kafkaConsumer = new KafkaConsumer();
    const redisStreams = new RedisStreams();
    const eventStore = new EventStore();

    // Initialize event bus
    const eventBus = new EventBus({
      kafkaProducer,
      kafkaConsumer,
      redisStreams,
      eventStore,
    });

    // Connect to services
    await kafkaProducer.connect();
    await kafkaConsumer.connect();
    await redisStreams.connect();
    await eventStore.initialize();

    // Start event bus
    await eventBus.start();

    logger.info('Event Bus service started successfully');

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      
      await eventBus.stop();
      await kafkaProducer.disconnect();
      await kafkaConsumer.disconnect();
      await redisStreams.disconnect();
      
      logger.info('Event Bus service stopped');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start Event Bus service:', error);
    process.exit(1);
  }
}

start();