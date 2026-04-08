import '@testing-library/jest-dom'

// Mock Next.js router for integration tests
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return ''
  },
}))

// Mock NextAuth for integration tests
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: null,
    status: 'unauthenticated'
  })),
  signIn: jest.fn(),
  signOut: jest.fn(),
  SessionProvider: ({ children }) => children,
}))

// DO NOT mock Prisma for integration tests - use real database
// Integration tests will import and use testPrisma from test-prisma.ts

// Set environment variables for integration tests
process.env.NODE_ENV = 'test'
process.env.TEST_TYPE = 'integration'
process.env.INTEGRATION_TEST = 'true'
process.env.NEXTAUTH_SECRET = 'test-secret-integration'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/warehouse_test'
process.env.SUPER_ADMIN_CODE = 'test-admin-code'

// Mock fetch globally
global.fetch = jest.fn()

// Setup console.error to fail tests on React warnings
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render is no longer supported') ||
       args[0].includes('Warning: validateDOMNesting'))
    ) {
      return
    }
    originalError.call(console, ...args)
    throw new Error('Console error detected in integration test')
  }
})

afterAll(() => {
  console.error = originalError
})

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks()
})