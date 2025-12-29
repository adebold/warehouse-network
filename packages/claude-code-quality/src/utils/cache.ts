/**
 * Cache Manager
 * 
 * Manages caching for analysis results and ML predictions
 */

import * as crypto from 'crypto';

import NodeCache from 'node-cache';

import { Logger } from './logger';

export class CacheManager {
  private cache: NodeCache;
  private logger: Logger;
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
    this.logger = new Logger('CacheManager');
    
    // Initialize cache with TTL and check period
    this.cache = new NodeCache({
      stdTTL: 3600, // 1 hour default TTL
      checkperiod: 600, // Check for expired keys every 10 minutes
      useClones: false // Don't clone for performance
    });

    this.setupEventHandlers();
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | undefined> {
    if (!this.enabled) {return undefined;}

    try {
      const value = this.cache.get<T>(key);
      
      if (value !== undefined) {
        this.logger.debug(`Cache hit: ${key}`);
      }
      
      return value;
    } catch (error) {
      this.logger.error('Cache get error', error);
      return undefined;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<boolean> {
    if (!this.enabled) {return false;}

    try {
      const success = ttl ? 
        this.cache.set(key, value, ttl) :
        this.cache.set(key, value);
      
      if (success) {
        this.logger.debug(`Cache set: ${key}`);
      }
      
      return success;
    } catch (error) {
      this.logger.error('Cache set error', error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const deleted = this.cache.del(key);
      
      if (deleted > 0) {
        this.logger.debug(`Cache delete: ${key}`);
      }
      
      return deleted > 0;
    } catch (error) {
      this.logger.error('Cache delete error', error);
      return false;
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    try {
      this.cache.flushAll();
      this.logger.info('Cache cleared');
    } catch (error) {
      this.logger.error('Cache clear error', error);
    }
  }

  /**
   * Get or compute value
   */
  async getOrCompute<T>(
    key: string, 
    compute: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Compute value
    const value = await compute();

    // Store in cache
    await this.set(key, value, ttl);

    return value;
  }

  /**
   * Generate cache key from file paths
   */
  generateKey(paths: string[]): string {
    const sorted = [...paths].sort();
    const combined = sorted.join('|');
    
    return crypto
      .createHash('sha256')
      .update(combined)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Generate cache key from object
   */
  generateObjectKey(obj: any): string {
    const json = JSON.stringify(obj);
    
    return crypto
      .createHash('sha256')
      .update(json)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      enabled: this.enabled,
      keys: this.cache.keys().length,
      hits: this.cache.getStats().hits,
      misses: this.cache.getStats().misses,
      ksize: this.cache.getStats().ksize,
      vsize: this.cache.getStats().vsize
    };
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers() {
    this.cache.on('expired', (key, value) => {
      this.logger.debug(`Cache expired: ${key}`);
    });

    this.cache.on('flush', () => {
      this.logger.debug('Cache flushed');
    });

    this.cache.on('set', (key) => {
      this.logger.debug(`Cache set event: ${key}`);
    });

    this.cache.on('del', (key) => {
      this.logger.debug(`Cache delete event: ${key}`);
    });
  }

  /**
   * Enable or disable caching
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    
    if (!enabled) {
      this.clear();
    }
    
    this.logger.info(`Caching ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Close cache and clean up
   */
  close() {
    this.cache.close();
    this.logger.info('Cache closed');
  }
}