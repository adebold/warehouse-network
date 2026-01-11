/**
 * Simple logger utility for scripts
 */

const logger = {
  info: (...args) => {
    console.log(...args);
  },
  error: (...args) => {
    console.error(...args);
  },
  warn: (...args) => {
    console.warn(...args);
  },
  debug: (...args) => {
    if (process.env.DEBUG) {
      console.debug(...args);
    }
  },
};

module.exports = { logger };
