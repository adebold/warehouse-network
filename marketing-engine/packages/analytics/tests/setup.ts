/**
 * Test setup and utilities
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock timers if needed
// jest.useFakeTimers();

// Global test utilities
global.testUtils = {
  generateUserId: () => `test_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  generateEventId: () => `test_event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
};

// Extend Jest matchers if needed
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});