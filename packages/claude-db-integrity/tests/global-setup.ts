import fs from 'fs/promises';
import path from 'path';

/**
 * Global Jest setup
 * Runs once before all test suites
 */
export default async () => {
  console.log('🚀 Setting up Claude DB Integrity test environment...');
  
  // Create test directories
  const testDirs = [
    './tests/temp',
    './tests/fixtures',
    './tests/snapshots'
  ];
  
  for (const dir of testDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.warn(`Failed to create test directory ${dir}:`, error);
    }
  }
  
  // Create test fixtures
  await createTestFixtures();
  
  // Set up test database (if needed)
  await setupTestDatabase();
  
  console.log('✅ Test environment setup completed');
};

async function createTestFixtures() {
  const fixturesDir = './tests/fixtures';
  
  // Create sample schemas
  const schemas = {
    'user.json': {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'User',
      type: 'object',
      properties: {
        id: {
          type: 'string',
          pattern: '^user[0-9]+$'
        },
        email: {
          type: 'string',
          format: 'email'
        },
        name: {
          type: 'string',
          minLength: 2,
          maxLength: 100
        },
        age: {
          type: 'integer',
          minimum: 0,
          maximum: 150
        },
        profile: {
          type: 'object',
          properties: {
            bio: { type: 'string' },
            avatar: { type: 'string', format: 'uri' },
            preferences: {
              type: 'object',
              properties: {
                theme: { type: 'string', enum: ['light', 'dark'] },
                notifications: { type: 'boolean' }
              }
            }
          }
        },
        createdAt: {
          type: 'string',
          format: 'date-time'
        },
        updatedAt: {
          type: 'string',
          format: 'date-time'
        }
      },
      required: ['id', 'email', 'name'],
      additionalProperties: false
    },
    
    'product.json': {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Product',
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        price: { type: 'number', minimum: 0 },
        currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        category: {
          type: 'string',
          enum: ['electronics', 'clothing', 'books', 'home', 'sports']
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          uniqueItems: true
        },
        inventory: {
          type: 'object',
          properties: {
            inStock: { type: 'boolean' },
            quantity: { type: 'integer', minimum: 0 },
            reserved: { type: 'integer', minimum: 0 }
          },
          required: ['inStock', 'quantity']
        },
        images: {
          type: 'array',
          items: {
            type: 'string',
            format: 'uri'
          }
        }
      },
      required: ['id', 'name', 'price', 'currency', 'category'],
      additionalProperties: false
    },
    
    'order.json': {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Order',
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
              quantity: { type: 'integer', minimum: 1 },
              price: { type: 'number', minimum: 0 },
              currency: { type: 'string', pattern: '^[A-Z]{3}$' }
            },
            required: ['productId', 'quantity', 'price', 'currency']
          },
          minItems: 1
        },
        shipping: {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                state: { type: 'string' },
                zipCode: { type: 'string' },
                country: { type: 'string', pattern: '^[A-Z]{2}$' }
              },
              required: ['street', 'city', 'zipCode', 'country']
            },
            method: {
              type: 'string',
              enum: ['standard', 'express', 'overnight']
            },
            cost: { type: 'number', minimum: 0 }
          },
          required: ['address', 'method', 'cost']
        },
        payment: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              enum: ['credit_card', 'debit_card', 'paypal', 'bank_transfer']
            },
            status: {
              type: 'string',
              enum: ['pending', 'authorized', 'captured', 'failed', 'refunded']
            },
            amount: { type: 'number', minimum: 0 },
            currency: { type: 'string', pattern: '^[A-Z]{3}$' }
          },
          required: ['method', 'status', 'amount', 'currency']
        },
        status: {
          type: 'string',
          enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']
        },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      },
      required: ['id', 'userId', 'items', 'shipping', 'payment', 'status', 'createdAt'],
      additionalProperties: false
    }
  };
  
  for (const [filename, schema] of Object.entries(schemas)) {
    const filePath = path.join(fixturesDir, filename);
    await fs.writeFile(filePath, JSON.stringify(schema, null, 2));
  }
  
  // Create sample test data
  const testData = {
    'valid-users.json': [
      {
        id: 'user1',
        email: 'john.doe@example.com',
        name: 'John Doe',
        age: 30,
        profile: {
          bio: 'Software developer with 5 years of experience',
          avatar: 'https://example.com/avatar/john.jpg',
          preferences: {
            theme: 'dark',
            notifications: true
          }
        },
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-20T14:45:00Z'
      },
      {
        id: 'user2',
        email: 'jane.smith@example.com',
        name: 'Jane Smith',
        age: 28,
        createdAt: '2024-01-16T09:15:00Z',
        updatedAt: '2024-01-16T09:15:00Z'
      }
    ],
    
    'invalid-users.json': [
      {
        id: 'invalid1',
        email: 'not-an-email',
        name: 'A',
        age: -5
      },
      {
        email: 'missing.id@example.com',
        name: 'Missing ID'
      },
      {
        id: 'user3',
        email: 'valid@example.com',
        name: 'Valid Name',
        age: 200
      }
    ],
    
    'valid-products.json': [
      {
        id: 'prod1',
        name: 'Gaming Laptop',
        description: 'High-performance gaming laptop with RTX graphics',
        price: 1299.99,
        currency: 'USD',
        category: 'electronics',
        tags: ['gaming', 'laptop', 'rtx', 'high-performance'],
        inventory: {
          inStock: true,
          quantity: 15,
          reserved: 3
        },
        images: [
          'https://example.com/images/laptop1.jpg',
          'https://example.com/images/laptop2.jpg'
        ]
      },
      {
        id: 'prod2',
        name: 'Cotton T-Shirt',
        description: 'Comfortable cotton t-shirt in various colors',
        price: 24.99,
        currency: 'USD',
        category: 'clothing',
        tags: ['cotton', 't-shirt', 'casual'],
        inventory: {
          inStock: true,
          quantity: 50
        }
      }
    ]
  };
  
  for (const [filename, data] of Object.entries(testData)) {
    const filePath = path.join(fixturesDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }
}

async function setupTestDatabase() {
  // Set up in-memory test database or mock database
  // This could initialize a test SQLite database or set up mocks
  
  // For now, we'll just ensure environment variables are set
  process.env.TEST_DATABASE_URL = 'memory://test';
  process.env.NODE_ENV = 'test';
}