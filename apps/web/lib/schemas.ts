import { z } from 'zod'

// Enums matching new warehouse listing schema
export const UseType = {
  STORAGE: 'STORAGE',
  LIGHT_MANUFACTURING: 'LIGHT_MANUFACTURING',
  HEAVY_MANUFACTURING: 'HEAVY_MANUFACTURING',
  DISTRIBUTION: 'DISTRIBUTION',
  FULFILLMENT: 'FULFILLMENT',
  COLD_STORAGE: 'COLD_STORAGE',
  FOOD_PROCESSING: 'FOOD_PROCESSING',
  AUTOMOTIVE: 'AUTOMOTIVE',
  RETAIL_DISTRIBUTION: 'RETAIL_DISTRIBUTION'
} as const

export const LeaseType = {
  GROSS: 'GROSS',
  NET: 'NET',
  NNN: 'NNN',
  MODIFIED_GROSS: 'MODIFIED_GROSS'
} as const

// Warehouse Listing Schemas
export const warehouseListingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  
  // Location
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  distanceToHighway: z.number().positive().optional(),
  
  // Physical specs
  totalSqFt: z.number().int().positive('Total square footage must be positive'),
  minDivisibleSqFt: z.number().int().positive().optional(),
  clearHeight: z.number().positive('Clear height must be positive'),
  columnSpacing: z.string().optional(),
  heavyLoadCapable: z.boolean().default(false),
  floorLoadPsf: z.number().int().positive().optional(),
  
  // Zoning
  zoningCategory: z.string().min(1, 'Zoning category is required'),
  permittedUses: z.array(z.nativeEnum(UseType)).min(1, 'At least one permitted use is required'),
  
  // Parking & Yard
  employeeParkingSpaces: z.number().int().nonnegative().default(0),
  trailerParkingSpaces: z.number().int().nonnegative().default(0),
  hasYardStorage: z.boolean().default(false),
  yardStorageArea: z.number().positive().optional(),
  
  // Lease terms
  leaseType: z.nativeEnum(LeaseType),
  askingRentPsf: z.number().positive('Asking rent must be positive'),
  estimatedCamPsf: z.number().positive().optional(),
  minLeaseTerm: z.number().int().positive('Minimum lease term must be positive'),
  maxLeaseTerm: z.number().int().positive().optional(),
  availabilityDate: z.string().transform(str => new Date(str)),
})

// Dock Door Schema
export const dockDoorSchema = z.object({
  count: z.number().int().positive().default(1),
  dockHeight: z.number().positive('Dock height must be positive'),
  description: z.string().optional(),
})

// Drive-in Door Schema  
export const driveInDoorSchema = z.object({
  count: z.number().int().positive().default(1),
  width: z.number().positive('Width must be positive'),
  height: z.number().positive('Height must be positive'),
  description: z.string().optional(),
})

// Contact Schema
export const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  title: z.string().optional(),
  company: z.string().optional(),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  mobile: z.string().optional(),
})

// Inquiry Schema
export const inquirySchema = z.object({
  companyName: z.string().optional(),
  spaceNeeded: z.number().int().positive().optional(),
  message: z.string().min(1, 'Message is required'),
})

export const receivingOrderSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  carrier: z.string().optional(),
  expectedSkidCount: z.number().int().positive().optional(),
  notes: z.string().optional(),
})

export const generateSkidsSchema = z.object({
  numberOfSkids: z.number().int().positive('Number of skids must be a positive number'),
})

export const locationSchema = z.object({
  name: z.string().min(1, 'Location name is required'),
  warehouseId: z.string().min(1, 'Warehouse is required'),
})

export const releaseRequestSchema = z.object({
  requestedAt: z.string().min(1, 'Requested pickup date is required'),
  carrierDetails: z.string().min(1, 'Carrier details are required'),
  skidIds: z.array(z.string()).min(1, 'At least one skid must be selected'),
})

export const updateReleaseRequestSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
})

export const rfqSchema = z.object({
  preferredWarehouseIds: z.array(z.string()).min(1, 'At least one preferred warehouse must be selected'),
  estimatedSkidCount: z.number().int().positive('Estimated skid count must be a positive number'),
  footprintType: z.enum(['STANDARD', 'OVERSIZED']),
  expectedInboundDate: z.string().min(1, 'Expected inbound date is required'),
  expectedDuration: z.string().optional(),
  specialHandlingNotes: z.string().optional(),
})

export const quoteItemSchema = z.object({
  chargeCategory: z.enum(['RECEIVING', 'STORAGE', 'PICKING', 'PICKUP_RELEASE']),
  unitPrice: z.number().positive('Unit price must be a positive number'),
  quantity: z.number().int().positive('Quantity must be a positive number'),
  description: z.string().optional(),
})

export const quoteSchema = z.object({
  rfqId: z.string().min(1, 'RFQ ID is required'),
  warehouseId: z.string().min(1, 'Warehouse is required'),
  items: z.array(quoteItemSchema).min(1, 'At least one quote item is required'),
  currency: z.string().min(1, 'Currency is required'),
  assumptions: z.string().optional(),
  guaranteedCharges: z.boolean(),
  depositAmount: z.number().positive('Deposit amount must be a positive number'),
  accrualStartRule: z.enum(['ON_RECEIPT', 'FIXED_DATE']),
  expiryDate: z.string().min(1, 'Expiry date is required'),
})

export const updateQuoteStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'REJECTED']),
})

export const cityPageSchema = z.object({
  city: z.string().min(1, 'City is required'),
  region: z.string().optional(),
  h1: z.string().min(1, 'H1 title is required'),
  introContent: z.string().min(1, 'Intro content is required'),
  isActive: z.boolean(),
})

export const generateReferralCodeSchema = z.object({
  referralType: z.enum(['CUSTOMER_TO_CUSTOMER', 'OPERATOR_TO_OPERATOR', 'OPERATOR_TO_CUSTOMER']),
})

export const registerWithReferralSchema = z.object({
  referralCode: z.string().min(1, 'Referral code is required'),
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
})

export const disputeSchema = z.object({
  type: z.enum(['DAMAGED_GOODS', 'MISSING_GOODS', 'INCORRECT_CHARGES', 'SLA_BREACHES', 'MISDECLARED_GOODS']),
  description: z.string().min(1, 'Description is required'),
  skidIds: z.array(z.string()).min(1, 'At least one skid must be selected'),
  evidence: z.string().optional(),
})

export const updateDisputeSchema = z.object({
  resolution: z.string().min(1, 'Resolution details are required'),
  status: z.enum(['IN_REVIEW', 'RESOLVED', 'ESCALATED']),
})

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
})

export const applicationReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().optional(),
})
