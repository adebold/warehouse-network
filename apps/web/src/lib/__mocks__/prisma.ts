// Mock Prisma Client for Testing
// This mock provides a comprehensive interface for all Prisma operations

import { jest } from '@jest/globals'

// Create mock functions for all Prisma operations
const createMockTable = () => ({
  findUnique: jest.fn(),
  findUniqueOrThrow: jest.fn(),
  findFirst: jest.fn(),
  findFirstOrThrow: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  createMany: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  upsert: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
  count: jest.fn(),
  aggregate: jest.fn(),
  groupBy: jest.fn(),
})

export const prismaMock = {
  // User management
  user: createMockTable(),
  organization: createMockTable(),
  role: createMockTable(),
  permission: createMockTable(),
  userRole: createMockTable(),
  rolePermission: createMockTable(),
  invitation: createMockTable(),
  auditLog: createMockTable(),

  // Payment system
  customer: createMockTable(),
  payment: createMockTable(),
  paymentMethod: createMockTable(),
  refund: createMockTable(),
  stripeAccount: createMockTable(),
  subscription: createMockTable(),
  invoice: createMockTable(),

  // Warehouse & logistics
  warehouse: createMockTable(),
  product: createMockTable(),
  inventory: createMockTable(),
  order: createMockTable(),
  orderItem: createMockTable(),
  shipment: createMockTable(),

  // Location & addressing
  address: createMockTable(),
  location: createMockTable(),

  // System utilities
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $executeRaw: jest.fn(),
  $executeRawUnsafe: jest.fn(),
  $queryRaw: jest.fn(),
  $queryRawUnsafe: jest.fn(),
  $transaction: jest.fn(),

  // Prisma transaction support
  $use: jest.fn(),
  $on: jest.fn(),
  $extends: jest.fn(),
}

// Helper function to reset all mocks
export const resetPrismaMocks = () => {
  Object.values(prismaMock).forEach((table) => {
    if (typeof table === 'object' && table !== null) {
      Object.values(table).forEach((method) => {
        if (jest.isMockFunction(method)) {
          method.mockReset()
        }
      })
    } else if (jest.isMockFunction(table)) {
      table.mockReset()
    }
  })
}

// Helper function to mock successful responses
export const mockPrismaSuccess = (table: string, operation: string, data: any) => {
  const tableObj = (prismaMock as any)[table]
  if (tableObj && tableObj[operation]) {
    tableObj[operation].mockResolvedValue(data)
  }
}

// Helper function to mock errors
export const mockPrismaError = (table: string, operation: string, error: Error) => {
  const tableObj = (prismaMock as any)[table]
  if (tableObj && tableObj[operation]) {
    tableObj[operation].mockRejectedValue(error)
  }
}

export default prismaMock