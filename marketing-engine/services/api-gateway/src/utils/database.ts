import knex, { Knex } from 'knex';
import { config } from '../config';
import { logger } from './logger';

// Create database connection with connection pooling
export const db: Knex = knex({
  client: 'postgresql',
  connection: config.database.url,
  pool: {
    min: config.database.poolMin,
    max: config.database.poolMax,
    createTimeoutMillis: 3000,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
    propagateCreateError: false,
  },
  acquireConnectionTimeout: 10000,
  log: {
    warn(message: string) {
      logger.warn('Database warning:', message);
    },
    error(message: string) {
      logger.error('Database error:', message);
    },
    deprecate(message: string) {
      logger.warn('Database deprecation:', message);
    },
    debug(message: string) {
      if (config.env === 'development') {
        logger.debug('Database debug:', message);
      }
    },
  },
});

// Test connection
db.raw('SELECT 1')
  .then(() => {
    logger.info('Database connection pool initialized');
  })
  .catch((err) => {
    logger.error('Database connection failed:', err);
    process.exit(1);
  });

// Helper functions for common patterns
export async function transaction<T>(
  callback: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  return db.transaction(callback);
}

export async function batchInsert<T extends Record<string, any>>(
  tableName: string,
  records: T[],
  chunkSize: number = 1000
): Promise<void> {
  await db.batchInsert(tableName, records, chunkSize);
}

export async function upsert<T extends Record<string, any>>(
  tableName: string,
  record: T,
  conflictColumns: string[]
): Promise<void> {
  await db(tableName)
    .insert(record)
    .onConflict(conflictColumns)
    .merge();
}

// Query builder helpers
export function paginate<T>(
  query: Knex.QueryBuilder,
  page: number = 1,
  limit: number = 20
): Knex.QueryBuilder<T> {
  const offset = (page - 1) * limit;
  return query.limit(limit).offset(offset);
}

export async function count(
  tableName: string,
  where?: Record<string, any>
): Promise<number> {
  const query = db(tableName);
  if (where) {
    query.where(where);
  }
  const result = await query.count('* as total').first();
  return parseInt(result?.total as string, 10);
}

// Health check
export async function isHealthy(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Monitoring helpers
export async function getPoolStats() {
  const pool = (db.client as any).pool;
  return {
    numUsed: pool.numUsed(),
    numFree: pool.numFree(),
    numPendingAcquires: pool.numPendingAcquires(),
    numPendingCreates: pool.numPendingCreates(),
  };
}