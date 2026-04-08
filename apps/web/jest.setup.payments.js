// Payment Test Setup for Node Environment
// This file configures the test environment for payment and external service tests

// Mock environment variables for payment tests
process.env.NEXTAUTH_SECRET = 'test-secret'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_stripe_secret_key'
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_fake_stripe_publishable_key'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_webhook_secret'

// Mock fetch for external API calls
global.fetch = jest.fn()

// Mock Stripe SDK
jest.mock('stripe', () => {
  const mockStripe = {
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    subscriptions: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
      cancel: jest.fn(),
      list: jest.fn(),
    },
    products: {
      create: jest.fn(),
      retrieve: jest.fn(),
      list: jest.fn(),
    },
    prices: {
      create: jest.fn(),
      retrieve: jest.fn(),
      list: jest.fn(),
    },
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      confirm: jest.fn(),
      cancel: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
  }

  return jest.fn(() => mockStripe)
})

// Mock Prisma for payment tests
const { prismaMock } = require('./src/lib/__mocks__/prisma')
jest.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

// Cleanup after each payment test
afterEach(() => {
  jest.clearAllMocks()
})