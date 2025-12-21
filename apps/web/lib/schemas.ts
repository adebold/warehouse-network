import { z } from 'zod';

// Quote schema validation
export const quoteSchema = z.object({
  rfqId: z.string(),
  warehouseId: z.string(),
  currency: z.string().default('USD'),
  assumptions: z.string().optional(),
  guaranteedCharges: z.boolean().default(false),
  depositAmount: z.number().min(0).default(0),
  accrualStartRule: z.enum(['ON_RECEIPT', 'FIXED_DATE']),
  expiryDate: z.string(),
  paymentMethod: z.enum(['INVOICE', 'CREDIT_CARD', 'ACH', 'WIRE', 'PO']).default('INVOICE'),
  paymentTerms: z.string().optional(),
  poNumber: z.string().optional(),
  items: z.array(
    z.object({
      chargeCategory: z.string(),
      unitPrice: z.number().min(0),
      quantity: z.number().min(1),
      description: z.string().optional(),
    })
  ),
});

// Payment method validation
export const paymentMethodSchema = z.enum(['INVOICE', 'CREDIT_CARD', 'ACH', 'WIRE', 'PO']);

// Payment terms validation
export const paymentTermsSchema = z.enum([
  'NET15',
  'NET30',
  'NET45',
  'NET60',
  'DUE_ON_RECEIPT',
  'CUSTOM',
]);

// PO number validation (when payment method is PO)
export const poNumberSchema = z.string().regex(/^[A-Z0-9\-]+$/i, {
  message: 'PO number can only contain letters, numbers, and hyphens',
});

// Accept invitation schema
export const acceptInvitationSchema = z.object({
  token: z.string(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

// City page schema
export const cityPageSchema = z.object({
  city: z.string().min(1),
  state: z.string().min(2),
  content: z.string(),
  isPublished: z.boolean().default(false),
});

// Application review schema
export const applicationReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'PENDING']),
  notes: z.string().optional(),
});

// Dispute schema
export const disputeSchema = z.object({
  description: z.string().min(10),
  amount: z.number().min(0),
  category: z.string(),
});

// Update quote status schema
export const updateQuoteStatusSchema = z.object({
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']),
  notes: z.string().optional(),
});

// Generate referral code schema
export const generateReferralCodeSchema = z.object({
  code: z.string().min(3),
  description: z.string().optional(),
});

// Release request schema
export const releaseRequestSchema = z.object({
  warehouseId: z.string(),
  items: z.array(z.object({
    skidId: z.string(),
    quantity: z.number().min(1),
  })),
  notes: z.string().optional(),
});

// RFQ schema
export const rfqSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(10),
  location: z.string(),
  requirements: z.array(z.string()),
});

// Register with referral schema
export const registerWithReferralSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  referralCode: z.string().optional(),
});

// Operator application schema
export const operatorApplicationSchema = z.object({
  companyName: z.string().min(1),
  businessType: z.string(),
  yearsInBusiness: z.number().min(0),
  warehouseCapacity: z.number().min(0),
  location: z.string(),
});

// Update dispute schema
export const updateDisputeSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']),
  resolution: z.string().optional(),
});

// Location schema
export const locationSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2),
  zipCode: z.string().min(5),
});

// Operator profile schema
export const operatorProfileSchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().min(1),
  email: z.string().email(),
  phone: z.string(),
  address: z.string(),
});

// Receiving order schema
export const receivingOrderSchema = z.object({
  customerId: z.string(),
  expectedItems: z.array(z.object({
    description: z.string(),
    quantity: z.number().min(1),
    unitType: z.string(),
  })),
  notes: z.string().optional(),
});

// Generate skids schema
export const generateSkidsSchema = z.object({
  count: z.number().min(1).max(1000),
  prefix: z.string().optional(),
});

// Update release request schema
export const updateReleaseRequestSchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED']),
  notes: z.string().optional(),
});

// Warehouse schema
export const warehouseSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2),
  zipCode: z.string().min(5),
  capacity: z.number().min(0),
});

// Pricing rules schema
export const pricingRulesSchema = z.object({
  baseRate: z.number().min(0),
  storageRate: z.number().min(0),
  handlingRate: z.number().min(0),
  minimumCharge: z.number().min(0),
});
