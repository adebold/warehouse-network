import { z } from 'zod'

export const operatorApplicationSchema = z.object({
  legalName: z.string().min(1, 'Legal name is required'),
  registrationDetails: z.string().min(1, 'Registration details are required'),
  primaryContact: z.string().min(1, 'Primary contact is required'),
  operatingRegions: z.string().min(1, 'Operating regions are required'),
  warehouseCount: z.number().int().positive('Warehouse count must be a positive number'),
  goodsCategories: z.string().min(1, 'Goods categories are required'),
  insurance: z.boolean().refine(val => val === true, 'You must acknowledge that you have insurance'),
})

export const applicationReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
})

export const operatorProfileSchema = z.object({
  legalName: z.string().min(1, 'Legal name is required'),
  registrationDetails: z.string().min(1, 'Registration details are required'),
  primaryContact: z.string().min(1, 'Primary contact is required'),
  operatingRegions: z.string().min(1, 'Operating regions are required'),
  warehouseCount: z.number().int().positive('Warehouse count must be a positive number'),
  goodsCategories: z.string().min(1, 'Goods categories are required'),
})

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(8),
})

export const warehouseSchema = z.object({
  name: z.string().min(1, 'Warehouse name is required'),
  address: z.string().min(1, 'Address is required'),
  operatingHours: z.string().min(1, 'Operating hours are required'),
  capacity: z.number().int().positive('Capacity must be a positive number'),
  supportedGoods: z.string().min(1, 'Supported goods are required'),
  dockAccessInstructions: z.string().min(1, 'Dock access instructions are required'),
})

export const pricingRulesSchema = z.record(z.nativeEnum(['RECEIVING', 'STORAGE', 'PICKING', 'PICKUP_RELEASE']), z.number().positive())

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
