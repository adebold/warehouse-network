/**
 * Browser-safe logger for client-side code
 * Use this in React components and pages (non-API routes)
 * For server-side API routes, use the full logger from './logger'
 */

export const logger = {
  info: (...args: unknown[]) => {
    console.log('[INFO]', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
  },
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      console.debug('[DEBUG]', ...args);
    }
  },
};

export default logger;
