/**
 * Jest setup file for notification system tests
 */

import Redis from 'ioredis';

// Mock Redis for tests
jest.mock('ioredis', () => {
  const mockRedis = {
    ping: jest.fn().mockResolvedValue('PONG'),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    hmset: jest.fn().mockResolvedValue('OK'),
    hgetall: jest.fn().mockResolvedValue({}),
    hget: jest.fn().mockResolvedValue(null),
    zadd: jest.fn().mockResolvedValue(1),
    zrange: jest.fn().mockResolvedValue([]),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    zrevrange: jest.fn().mockResolvedValue([]),
    zrem: jest.fn().mockResolvedValue(1),
    zcard: jest.fn().mockResolvedValue(0),
    incrby: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
    decr: jest.fn().mockResolvedValue(0),
    expire: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
    lpush: jest.fn().mockResolvedValue(1),
    brpop: jest.fn().mockResolvedValue(null),
    llen: jest.fn().mockResolvedValue(0),
    pipeline: jest.fn().mockReturnValue({
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      hmset: jest.fn(),
      hgetall: jest.fn(),
      zadd: jest.fn(),
      zrem: jest.fn(),
      incr: jest.fn(),
      exec: jest.fn().mockResolvedValue([])
    }),
    quit: jest.fn().mockResolvedValue('OK')
  };

  return jest.fn().mockImplementation(() => mockRedis);
});

// Mock nodemailer
jest.mock('nodemailer', () => ({
  createTransporter: jest.fn().mockReturnValue({
    sendMail: jest.fn().mockResolvedValue({
      messageId: 'test-message-id',
      accepted: ['test@example.com'],
      rejected: [],
      response: '250 OK'
    }),
    verify: jest.fn().mockResolvedValue(true)
  })
}));

// Mock axios for webhook tests
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { success: true }
  })
}));

// Mock Firebase Admin SDK
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn().mockReturnValue({
    messaging: jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue('test-message-id'),
      sendAll: jest.fn().mockResolvedValue({
        responses: [
          { success: true, messageId: 'test-message-id-1' },
          { success: true, messageId: 'test-message-id-2' }
        ]
      })
    })
  }),
  credential: {
    cert: jest.fn().mockReturnValue({})
  },
  messaging: jest.fn().mockReturnValue({
    send: jest.fn().mockResolvedValue('test-message-id'),
    sendAll: jest.fn().mockResolvedValue({
      responses: [
        { success: true, messageId: 'test-message-id-1' },
        { success: true, messageId: 'test-message-id-2' }
      ]
    })
  })
}));

// Mock Twilio
jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    api: {
      accounts: jest.fn().mockReturnValue({
        fetch: jest.fn().mockResolvedValue({ sid: 'test-account-sid' })
      })
    },
    messages: {
      create: jest.fn().mockResolvedValue({
        sid: 'test-message-sid',
        status: 'queued',
        direction: 'outbound-api',
        from: '+1234567890',
        to: '+0987654321'
      })
    }
  }));
});

// Mock Winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis()
  }),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    colorize: jest.fn(),
    printf: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Global test timeout
jest.setTimeout(30000);

// Clean up after tests
afterEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  jest.restoreAllMocks();
});