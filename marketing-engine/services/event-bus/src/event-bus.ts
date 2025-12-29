import { v4 as uuidv4 } from 'uuid';
import { KafkaProducer } from './kafka/producer';
import { KafkaConsumer } from './kafka/consumer';
import { RedisStreams } from './redis/streams';
import { EventStore } from './event-store';
import { logger } from './utils/logger';
import { EventSchema, validateEvent } from './schemas/event';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

export interface Event {
  id: string;
  type: string;
  source: string;
  timestamp: Date;
  data: any;
  metadata: {
    correlationId?: string;
    causationId?: string;
    userId?: string;
    version: string;
    [key: string]: any;
  };
}

export interface EventBusOptions {
  kafkaProducer: KafkaProducer;
  kafkaConsumer: KafkaConsumer;
  redisStreams: RedisStreams;
  eventStore: EventStore;
}

export interface EventHandler {
  (event: Event): Promise<void>;
}

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  private running = false;
  private tracer = trace.getTracer('event-bus');

  constructor(private options: EventBusOptions) {}

  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Event bus is already running');
    }

    this.running = true;

    // Start consuming from Kafka
    await this.options.kafkaConsumer.subscribe({
      topics: ['marketing-events'],
      fromBeginning: false,
    });

    await this.options.kafkaConsumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        await this.handleKafkaMessage(topic, partition, message);
      },
    });

    // Start consuming from Redis streams
    await this.options.redisStreams.consume('marketing:events', async (events) => {
      for (const event of events) {
        await this.handleRedisEvent(event);
      }
    });

    logger.info('Event bus started');
  }

  async stop(): Promise<void> {
    this.running = false;
    logger.info('Event bus stopped');
  }

  async publish(event: Partial<Event>): Promise<string> {
    const span = this.tracer.startSpan('event.publish');
    
    try {
      // Generate event ID if not provided
      const fullEvent: Event = {
        id: event.id || uuidv4(),
        type: event.type!,
        source: event.source!,
        timestamp: event.timestamp || new Date(),
        data: event.data,
        metadata: {
          version: '1.0',
          ...event.metadata,
        },
      };

      // Validate event
      const validation = validateEvent(fullEvent);
      if (validation.error) {
        throw new Error(`Invalid event: ${validation.error.message}`);
      }

      span.setAttributes({
        'event.id': fullEvent.id,
        'event.type': fullEvent.type,
        'event.source': fullEvent.source,
      });

      // Store event
      await this.options.eventStore.store(fullEvent);

      // Publish to Kafka for cross-service communication
      await this.options.kafkaProducer.send({
        topic: 'marketing-events',
        messages: [{
          key: fullEvent.type,
          value: JSON.stringify(fullEvent),
          headers: {
            'event-id': fullEvent.id,
            'event-type': fullEvent.type,
            'correlation-id': fullEvent.metadata.correlationId || '',
          },
        }],
      });

      // Publish to Redis for real-time processing
      await this.options.redisStreams.add('marketing:events', fullEvent);

      logger.info('Event published', {
        eventId: fullEvent.id,
        eventType: fullEvent.type,
        source: fullEvent.source,
      });

      span.setStatus({ code: SpanStatusCode.OK });
      return fullEvent.id;

    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  }

  subscribe(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
    
    logger.info('Event handler registered', { eventType });
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    const index = handlers.indexOf(handler);
    
    if (index > -1) {
      handlers.splice(index, 1);
      this.handlers.set(eventType, handlers);
      logger.info('Event handler unregistered', { eventType });
    }
  }

  private async handleKafkaMessage(
    topic: string,
    partition: number,
    message: any
  ): Promise<void> {
    const span = this.tracer.startSpan('event.handle.kafka');
    
    try {
      const event: Event = JSON.parse(message.value.toString());
      
      span.setAttributes({
        'event.id': event.id,
        'event.type': event.type,
        'kafka.topic': topic,
        'kafka.partition': partition,
      });

      await this.processEvent(event);
      span.setStatus({ code: SpanStatusCode.OK });

    } catch (error) {
      logger.error('Failed to handle Kafka message', error);
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      
      // Send to dead letter queue
      await this.sendToDeadLetter(message, error);
    } finally {
      span.end();
    }
  }

  private async handleRedisEvent(event: any): Promise<void> {
    const span = this.tracer.startSpan('event.handle.redis');
    
    try {
      span.setAttributes({
        'event.id': event.id,
        'event.type': event.type,
      });

      await this.processEvent(event);
      span.setStatus({ code: SpanStatusCode.OK });

    } catch (error) {
      logger.error('Failed to handle Redis event', error);
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
    } finally {
      span.end();
    }
  }

  private async processEvent(event: Event): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    
    if (handlers.length === 0) {
      logger.debug('No handlers for event type', { eventType: event.type });
      return;
    }

    // Execute handlers in parallel
    const results = await Promise.allSettled(
      handlers.map(handler => 
        this.executeHandler(handler, event)
      )
    );

    // Log any failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        logger.error('Event handler failed', {
          eventId: event.id,
          eventType: event.type,
          handlerIndex: index,
          error: result.reason,
        });
      }
    });
  }

  private async executeHandler(
    handler: EventHandler,
    event: Event
  ): Promise<void> {
    const span = this.tracer.startSpan('event.handler.execute');
    
    try {
      span.setAttributes({
        'event.id': event.id,
        'event.type': event.type,
      });

      // Set event context for tracing
      await context.with(
        trace.setSpan(context.active(), span),
        async () => {
          await handler(event);
        }
      );

      span.setStatus({ code: SpanStatusCode.OK });

    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  }

  private async sendToDeadLetter(message: any, error: any): Promise<void> {
    try {
      await this.options.kafkaProducer.send({
        topic: 'marketing-events-dlq',
        messages: [{
          key: 'failed-event',
          value: JSON.stringify({
            originalMessage: message,
            error: error.message,
            timestamp: new Date(),
          }),
        }],
      });
    } catch (dlqError) {
      logger.error('Failed to send to dead letter queue', dlqError);
    }
  }

  async replay(
    eventType?: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<void> {
    const events = await this.options.eventStore.query({
      eventType,
      startTime,
      endTime,
    });

    logger.info('Replaying events', {
      count: events.length,
      eventType,
      startTime,
      endTime,
    });

    for (const event of events) {
      await this.processEvent(event);
    }
  }
}