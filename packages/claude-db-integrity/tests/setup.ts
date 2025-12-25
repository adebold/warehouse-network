import { jest } from '@jest/globals';

// Global test setup for Claude DB Integrity

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce test noise (optional)
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args: any[]) => {
  // Only log errors that aren't expected test errors
  if (!args[0]?.toString().includes('Test error') && 
      !args[0]?.toString().includes('Expected failure')) {
    originalConsoleError(...args);
  }
};

console.warn = (...args: any[]) => {
  // Only log warnings that aren't expected test warnings
  if (!args[0]?.toString().includes('Test warning')) {
    originalConsoleWarn(...args);
  }
};

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidSchema(): R;
      toHaveValidationError(expectedError: string): R;
    }
  }
}

// Custom matchers
expect.extend({
  toBeValidSchema(received: any) {
    const isValid = received && 
                   typeof received === 'object' &&
                   received.type !== undefined;
    
    if (isValid) {
      return {
        message: () => `Expected ${received} not to be a valid schema`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${received} to be a valid schema`,
        pass: false,
      };
    }
  },
  
  toHaveValidationError(received: any, expectedError: string) {
    const hasError = received?.errors?.some((error: any) => 
      error.message?.includes(expectedError) || 
      error.toString().includes(expectedError)
    );
    
    if (hasError) {
      return {
        message: () => `Expected validation result not to have error "${expectedError}"`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected validation result to have error "${expectedError}", but got: ${JSON.stringify(received?.errors)}`,
        pass: false,
      };
    }
  }
});

// Mock environment variables for consistent testing
process.env.NODE_ENV = 'test';
process.env.CLAUDE_INTEGRITY_ENABLED = 'false';
process.env.CLAUDE_FLOW_ENABLED = 'false';
process.env.DATABASE_URL = 'memory://test';

// Global test data
export const testSchemas = {
  user: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      email: { type: 'string', format: 'email' },
      name: { type: 'string', minLength: 2 },
      age: { type: 'number', minimum: 0, maximum: 150 }
    },
    required: ['id', 'email', 'name']
  },
  
  product: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string', minLength: 1 },
      price: { type: 'number', minimum: 0 },
      category: { 
        type: 'string', 
        enum: ['electronics', 'clothing', 'books'] 
      }
    },
    required: ['id', 'name', 'price', 'category']
  },
  
  order: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      userId: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            productId: { type: 'string' },
            quantity: { type: 'number', minimum: 1 },
            price: { type: 'number', minimum: 0 }
          },
          required: ['productId', 'quantity', 'price']
        },
        minItems: 1
      },
      total: { type: 'number', minimum: 0 },
      status: { 
        type: 'string', 
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] 
      },
      createdAt: { type: 'string', format: 'date-time' }
    },
    required: ['id', 'userId', 'items', 'total', 'status', 'createdAt']
  }
};

export const testData = {
  validUsers: [
    {
      id: 'user1',
      email: 'john@example.com',
      name: 'John Doe',
      age: 30
    },
    {
      id: 'user2',
      email: 'jane@example.com',
      name: 'Jane Smith',
      age: 25
    }
  ],
  
  invalidUsers: [
    {
      id: 'user3',
      email: 'invalid-email',
      name: 'A', // Too short
      age: -5 // Negative age
    },
    {
      email: 'missing@id.com',
      name: 'Missing ID'
      // Missing required id field
    }
  ],
  
  validProducts: [
    {
      id: 'prod1',
      name: 'Laptop',
      price: 999.99,
      category: 'electronics'
    },
    {
      id: 'prod2',
      name: 'T-Shirt',
      price: 29.99,
      category: 'clothing'
    }
  ],
  
  invalidProducts: [
    {
      id: 'prod3',
      name: '',
      price: -10,
      category: 'invalid-category'
    }
  ]
};

// Helper functions for tests
export const createTestConfig = (overrides: any = {}) => {
  return {
    database: {
      type: 'memory',
      connection: 'test'
    },
    claude: {
      enabled: false,
      namespace: 'test-integrity'
    },
    validation: {
      strict: true,
      autoFix: false
    },
    monitoring: {
      enabled: false
    },
    ...overrides
  };
};

export const createMockValidationResult = (isValid: boolean, errors: any[] = []) => {
  return {
    isValid,
    errors,
    warnings: [],
    metadata: {
      schema: 'test-schema',
      timestamp: new Date().toISOString(),
      duration: Math.random() * 100
    }
  };
};

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Cleanup function for tests
export const cleanup = async () => {
  // Clear any test files or temporary data
  // This is called by individual tests as needed
};

console.log('📋 Claude DB Integrity test setup completed');