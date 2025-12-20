import { z } from 'zod'

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
  items: z.array(z.object({
    chargeCategory: z.string(),
    unitPrice: z.number().min(0),
    quantity: z.number().min(1),
    description: z.string().optional(),
  })),
})

// Payment method validation
export const paymentMethodSchema = z.enum(['INVOICE', 'CREDIT_CARD', 'ACH', 'WIRE', 'PO'])

// Payment terms validation
export const paymentTermsSchema = z.enum(['NET15', 'NET30', 'NET45', 'NET60', 'DUE_ON_RECEIPT', 'CUSTOM'])

// PO number validation (when payment method is PO)
export const poNumberSchema = z.string().regex(/^[A-Z0-9\-]+$/i, {
  message: 'PO number can only contain letters, numbers, and hyphens',
})