/**
 * Simple logger utility for test files
 */

export const logger = {
  info: (...args: unknown[]) => {
    console.log(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  debug: (...args: unknown[]) => {
    if (process.env.DEBUG) {
      console.debug(...args);
    }
  },
};
