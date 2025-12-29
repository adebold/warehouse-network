// Comprehensive type definitions for warehouse system
import type { 
  User as PrismaUser,
  Customer as PrismaCustomer, 
  Warehouse as PrismaWarehouse,
  Operator as PrismaOperator,
  RFQ as PrismaRFQ,
  Quote as PrismaQuote,
  QuoteItem as PrismaQuoteItem,
  ChargeCategory as PrismaChargeCategory,
  ChargeLine as PrismaChargeLine,
  Skid as PrismaSkid,
  Location as PrismaLocation,
  ReleaseRequest as PrismaReleaseRequest,
  ReceivingOrder as PrismaReceivingOrder,
  CityPage as PrismaCityPage,
  Referral as PrismaReferral,
  Dispute as PrismaDispute,
  AccountLockHistory as PrismaAccountLockHistory,
  Lead as PrismaLead,
  AIInteraction as PrismaAIInteraction,
  SearchHistory as PrismaSearchHistory,
  Notification as PrismaNotification,
  Booking as PrismaBooking,
  BookingCharge as PrismaBookingCharge,
  CustomerAccountStatus,
  CustomerPaymentStatus,
  UserRole,
  WarehouseStatus,
  SkidStatus,
  RFQStatus,
  QuoteStatus,
  PaymentMethod,
  AccrualStartRule,
  ReleaseRequestStatus,
  OperatorStatus,
  PayoutStatus,
  DisputeType,
  DisputeStatus,
  ReferralType,
  ReferralStatus,
  LockAction,
  LeadStatus,
  InteractionType,
  NotificationType,
  BookingStatus,
  BookingChargeType
} from '@prisma/client'

// Re-export all Prisma types with extensions
export type User = PrismaUser
export type Customer = PrismaCustomer & {
  totalOutstanding?: number // Optional calculated field
}
export type Warehouse = PrismaWarehouse
export type Operator = PrismaOperator
export type RFQ = PrismaRFQ
export type Quote = PrismaQuote
export type QuoteItem = PrismaQuoteItem
export type ChargeCategory = PrismaChargeCategory
export type ChargeLine = PrismaChargeLine
export type Skid = PrismaSkid
export type Location = PrismaLocation
export type ReleaseRequest = PrismaReleaseRequest
export type ReceivingOrder = PrismaReceivingOrder
export type CityPage = PrismaCityPage
export type Referral = PrismaReferral
export type Dispute = PrismaDispute
export type AccountLockHistory = PrismaAccountLockHistory
export type Lead = PrismaLead
export type AIInteraction = PrismaAIInteraction
export type SearchHistory = PrismaSearchHistory
export type Notification = PrismaNotification
export type Booking = PrismaBooking
export type BookingCharge = PrismaBookingCharge

// Re-export enums
export {
  CustomerAccountStatus,
  CustomerPaymentStatus,
  UserRole,
  WarehouseStatus,
  SkidStatus,
  RFQStatus,
  QuoteStatus,
  PaymentMethod,
  AccrualStartRule,
  ReleaseRequestStatus,
  OperatorStatus,
  PayoutStatus,
  DisputeType,
  DisputeStatus,
  ReferralType,
  ReferralStatus,
  LockAction,
  LeadStatus,
  InteractionType,
  NotificationType,
  BookingStatus,
  BookingChargeType
}

// Additional application-specific types
export interface Inventory {
  id: string
  warehouseId: string
  skidId: string
  status: SkidStatus
  location: Location
  receivedAt: Date
  updatedAt: Date
}

export interface Order {
  id: string
  customerId: string
  warehouseId: string
  items: OrderItem[]
  status: OrderStatus
  total: number
  currency: string
  createdAt: Date
  updatedAt: Date
}

export interface OrderItem {
  id: string
  orderId: string
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

// Extended types with relationships
export interface CustomerWithRelations extends Customer {
  users?: User[]
  skids?: Skid[]
  releaseRequests?: ReleaseRequest[]
  disputes?: Dispute[]
  receivingOrders?: ReceivingOrder[]
  rfqs?: RFQ[]
  lockHistory?: AccountLockHistory[]
  bookings?: Booking[]
}

export interface WarehouseWithRelations extends Warehouse {
  operator?: Operator
  skids?: Skid[]
  locations?: Location[]
  releaseRequests?: ReleaseRequest[]
  disputes?: Dispute[]
  receivingOrders?: ReceivingOrder[]
  quotes?: Quote[]
  bookings?: Booking[]
}

export interface UserWithRelations extends User {
  customer?: Customer
  operatorUser?: any // OperatorUser relation
  auditEvents?: any[] // AuditEvent relation
  cityPages?: CityPage[]
  credits?: any[] // Credit relation
  referralsMade?: Referral[]
  referralsReceived?: Referral[]
  lockActionsPerformed?: AccountLockHistory[]
  convertedLeads?: Lead[]
  aiInteractions?: AIInteraction[]
  searchHistory?: SearchHistory[]
  notifications?: Notification[]
}

export interface QuoteWithRelations extends Quote {
  rfq?: RFQ
  warehouse?: Warehouse
  items?: QuoteItem[]
  deposits?: any[] // Deposit relation
}

export interface RFQWithRelations extends RFQ {
  customer?: Customer
  quotes?: Quote[]
}

// Dashboard and analytics types
export interface DashboardStats {
  totalCustomers: number
  totalWarehouses: number
  totalSkids: number
  totalRevenue: number
  monthlyGrowth: number
}

export interface AnalyticsData {
  timestamp: Date
  metric: string
  value: number
  metadata?: Record<string, any>
}

// Search and filtering types
export interface SearchFilters {
  status?: string[]
  location?: string
  dateRange?: {
    start: Date
    end: Date
  }
  priceRange?: {
    min: number
    max: number
  }
}

export interface SearchResult {
  id: string
  type: 'warehouse' | 'customer' | 'skid' | 'quote'
  title: string
  description: string
  score: number
  metadata?: Record<string, any>
}

// Payment and billing types
export interface PaymentStatus {
  customerId: string
  totalOutstanding: number
  overdueAmount: number
  paymentDueDate?: Date
  accountStatus: CustomerAccountStatus
  paymentStatus: CustomerPaymentStatus
}

export interface BillingInfo {
  customerId: string
  totalCharges: number
  totalPaid: number
  balance: number
  lastPaymentDate?: Date
  nextDueDate?: Date
}

// API response types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

// Form and validation types
export interface FormError {
  field: string
  message: string
}

export interface ValidationResult {
  isValid: boolean
  errors: FormError[]
}

// Component prop types
export interface TableColumn<T = any> {
  key: string
  header: string
  accessor?: (item: T) => React.ReactNode
  className?: string
}

export interface BreadcrumbItem {
  title: string
  href?: string
  isCurrentPage?: boolean
}

// Notification and alert types
export interface AlertConfig {
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  duration?: number
}

// Analytics and reporting types
export interface ReportFilter {
  startDate: Date
  endDate: Date
  customerIds?: string[]
  warehouseIds?: string[]
  status?: string[]
}

export interface OverdueCustomer {
  customerId: string
  customerName: string
  totalOverdue: number
  daysPastDue: number
  lastPaymentDate?: Date
  contactInfo: {
    email: string
    phone?: string
  }
}