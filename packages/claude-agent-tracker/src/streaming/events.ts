/**
 * Real-time event streaming with EventEmitter
 */

import { EventEmitter } from 'events';

import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

import { agentManager } from '../agents/manager.js';
import { redis } from '../database/redis.js';
import { logger } from '../monitoring/logger.js';
import { StreamEvent } from '../types/index.js';

export interface StreamClient {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  authenticated: boolean;
}

export class EventStreamer extends EventEmitter {
  private wss?: WebSocket.Server;
  private clients: Map<string, StreamClient> = new Map();
  private eventHistory: StreamEvent[] = [];
  private maxHistorySize = 1000;

  constructor() {
    super();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Agent events
    agentManager.on('agent:spawned', (agent) => {
      this.broadcastEvent('agent.spawned', agent);
    });

    agentManager.on('agent:terminated', (agent) => {
      this.broadcastEvent('agent.terminated', agent);
    });

    agentManager.on('agent:error', (error) => {
      this.broadcastEvent('agent.error', error);
    });

    agentManager.on('task:started', ({ agent, task }) => {
      this.broadcastEvent('task.started', { agentId: agent.id, task });
    });

    agentManager.on('task:completed', ({ agent, task }) => {
      this.broadcastEvent('task.completed', { agentId: agent.id, task });
    });

    agentManager.on('task:failed', ({ agent, task }) => {
      this.broadcastEvent('task.failed', { agentId: agent.id, task });
    });

    // Subscribe to Redis pub/sub for distributed events
    this.setupRedisSubscriptions();
  }

  private async setupRedisSubscriptions(): Promise<void> {
    try {
      await redis.subscribe('agent-tracker:events', (message) => {
        this.handleRedisEvent(message);
      });
    } catch (error) {
      logger.error('Failed to setup Redis subscriptions', { error });
    }
  }

  private handleRedisEvent(message: any): void {
    if (message.nodeId === process.env.NODE_ID) {
      // Ignore our own events
      return;
    }

    this.broadcastToClients(message.event, message.subscriptions);
  }

  async broadcastEvent(
    type: string,
    data: any,
    subscriptions: string[] = ['*']
  ): Promise<void> {
    const event: StreamEvent = {
      id: uuidv4(),
      type,
      timestamp: new Date(),
      data,
      metadata: {
        nodeId: process.env.NODE_ID || 'default',
        subscriptions
      }
    };

    // Store in history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Broadcast to local clients
    this.broadcastToClients(event, subscriptions);

    // Publish to Redis for other nodes
    await redis.publish('agent-tracker:events', {
      nodeId: process.env.NODE_ID,
      event,
      subscriptions
    });

    // Store event for persistence
    await redis.lpush('events:history', event);
    await redis.ltrim('events:history', 0, this.maxHistorySize - 1);
  }

  private broadcastToClients(event: StreamEvent, subscriptions: string[]): void {
    for (const client of this.clients.values()) {
      if (!client.authenticated) {continue;}

      // Check if client is subscribed to this event
      const shouldReceive = subscriptions.includes('*') ||
        subscriptions.some(sub => client.subscriptions.has(sub));

      if (shouldReceive) {
        this.sendToClient(client, event);
      }
    }
  }

  private sendToClient(client: StreamClient, event: StreamEvent): void {
    try {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'event',
          event
        }));
      }
    } catch (error) {
      logger.error('Failed to send event to client', {
        clientId: client.id,
        error
      });
    }
  }

  attachWebSocketServer(wss: WebSocket.Server): void {
    this.wss = wss;

    wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      const client: StreamClient = {
        id: clientId,
        ws,
        subscriptions: new Set(['*']),
        authenticated: false
      };

      this.clients.set(clientId, client);
      logger.info('WebSocket client connected', { clientId });

      // Send connection acknowledgment
      ws.send(JSON.stringify({
        type: 'connection',
        clientId,
        requiresAuth: true
      }));

      // Handle client messages
      ws.on('message', (message) => {
        this.handleClientMessage(client, message.toString());
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(clientId);
        logger.info('WebSocket client disconnected', { clientId });
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket client error', { clientId, error });
      });

      // Send ping every 30 seconds
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }, 30000);

      ws.on('close', () => {
        clearInterval(pingInterval);
      });
    });
  }

  private async handleClientMessage(client: StreamClient, message: string): Promise<void> {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'auth':
          await this.authenticateClient(client, data.token);
          break;

        case 'subscribe':
          this.handleSubscribe(client, data.channels);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(client, data.channels);
          break;

        case 'history':
          await this.sendHistory(client, data.count);
          break;

        case 'ping':
          client.ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          logger.warn('Unknown client message type', {
            clientId: client.id,
            type: data.type
          });
      }
    } catch (error) {
      logger.error('Failed to handle client message', {
        clientId: client.id,
        error
      });

      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  }

  private async authenticateClient(client: StreamClient, token: string): Promise<void> {
    // In a real implementation, verify JWT token here
    // For now, we'll do a simple check
    if (token && token.length > 10) {
      client.authenticated = true;
      client.ws.send(JSON.stringify({
        type: 'auth',
        success: true
      }));

      logger.info('Client authenticated', { clientId: client.id });
    } else {
      client.ws.send(JSON.stringify({
        type: 'auth',
        success: false,
        message: 'Invalid token'
      }));
    }
  }

  private handleSubscribe(client: StreamClient, channels: string[]): void {
    if (!client.authenticated) {
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Not authenticated'
      }));
      return;
    }

    for (const channel of channels) {
      client.subscriptions.add(channel);
    }

    client.ws.send(JSON.stringify({
      type: 'subscribed',
      channels
    }));

    logger.debug('Client subscribed to channels', {
      clientId: client.id,
      channels
    });
  }

  private handleUnsubscribe(client: StreamClient, channels: string[]): void {
    for (const channel of channels) {
      client.subscriptions.delete(channel);
    }

    client.ws.send(JSON.stringify({
      type: 'unsubscribed',
      channels
    }));
  }

  private async sendHistory(client: StreamClient, count = 50): Promise<void> {
    if (!client.authenticated) {
      client.ws.send(JSON.stringify({
        type: 'error',
        message: 'Not authenticated'
      }));
      return;
    }

    // Get from memory first
    const memoryHistory = this.eventHistory.slice(-count);

    // If we need more, fetch from Redis
    if (memoryHistory.length < count) {
      const redisHistory = await redis.lrange<StreamEvent>(
        'events:history',
        0,
        count - memoryHistory.length - 1
      );

      const combined = [...redisHistory.reverse(), ...memoryHistory];

      client.ws.send(JSON.stringify({
        type: 'history',
        events: combined
      }));
    } else {
      client.ws.send(JSON.stringify({
        type: 'history',
        events: memoryHistory
      }));
    }
  }

  getConnectedClients(): number {
    return this.clients.size;
  }

  getAuthenticatedClients(): number {
    return Array.from(this.clients.values()).filter(c => c.authenticated).length;
  }

  async shutdown(): Promise<void> {
    // Close all client connections
    for (const client of this.clients.values()) {
      client.ws.close(1000, 'Server shutting down');
    }

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
    }

    logger.info('Event streamer shut down');
  }
}

// Singleton instance
export const eventStreamer = new EventStreamer();