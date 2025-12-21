// Temporary type definitions for missing Prisma types
declare module '@prisma/client' {
  export interface Customer {
    id: string
    email: string
    name: string
    companyName?: string
    phone?: string
    accountStatus: CustomerAccountStatus
    paymentStatus: CustomerPaymentStatus
    creditLimit: number
    totalOutstanding?: number
    overdueAmount?: number
    createdAt: Date
    updatedAt: Date
  }

  export interface User {
    id: string
    email: string
    name: string
    role: string
    createdAt: Date
    updatedAt: Date
  }

  export interface Warehouse {
    id: string
    name: string
    address: string
    city: string
    state: string
    zipCode: string
    country: string
    createdAt: Date
    updatedAt: Date
  }

  export enum CustomerAccountStatus {
    ACTIVE = 'ACTIVE',
    SUSPENDED = 'SUSPENDED',
    LOCKED = 'LOCKED'
  }

  export enum CustomerPaymentStatus {
    CURRENT = 'CURRENT',
    OVERDUE = 'OVERDUE',
    DELINQUENT = 'DELINQUENT'
  }

  export interface RFQ {
    id: string
    customerId: string
    warehouseId: string
    status: string
    createdAt: Date
    updatedAt: Date
  }

  export interface Quote {
    id: string
    rfqId: string
    amount: number
    status: string
    createdAt: Date
    updatedAt: Date
  }

  export interface QuoteItem {
    id: string
    quoteId: string
    description: string
    quantity: number
    unitPrice: number
    total: number
  }

  export interface ChargeCategory {
    id: string
    name: string
    description: string
  }

  export interface Operator {
    id: string
    userId: string
    warehouseId: string
    status: string
  }

  export interface CityPage {
    id: string
    city: string
    state: string
    content: string
    isPublished: boolean
  }

  export interface Invitation {
    id: string
    email: string
    token: string
    expiresAt: Date
  }

  export interface AccountLockHistory {
    id: string
    customerId: string
    lockedAt: Date
    unlockedAt?: Date
    reason: string
  }
}