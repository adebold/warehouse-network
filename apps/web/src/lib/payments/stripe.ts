/**
 * Stripe Configuration and Client Setup
 *
 * This file configures Stripe for both server-side operations and client-side components.
 * It includes the main Stripe client, Connect configurations, and webhook handling setup.
 */

import Stripe from 'stripe';
import { loadStripe } from '@stripe/stripe-js';

// Environment variables validation
const requiredEnvVars = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  STRIPE_CONNECT_WEBHOOK_SECRET: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
} as const;

// Validate environment variables
Object.entries(requiredEnvVars).forEach(([key, value]) => {
  if (!value && typeof window === 'undefined') {
    console.warn(`Missing environment variable: ${key}`);
  }
});

/**
 * Server-side Stripe client
 * Used for all server-side Stripe API operations
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
  telemetry: false,
  appInfo: {
    name: 'Skidspace Warehouse Network',
    version: '1.0.0',
    url: 'https://skidspace.com',
  },
});

/**
 * Client-side Stripe promise
 * Lazy-loaded Stripe.js for client-side operations
 */
let stripePromise: Promise<Stripe | null> | null = null;

export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};

/**
 * Stripe Connect Configuration
 */
export const STRIPE_CONNECT_CONFIG = {
  // Application fees as percentage (multiply by 100 for Stripe)
  PLATFORM_FEE_PERCENTAGE: 0.029, // 2.9%
  PLATFORM_FEE_FIXED: 30, // 30 cents in addition to percentage

  // Account types for different organization types
  ACCOUNT_TYPES: {
    WAREHOUSE: 'standard' as const,
    EBIKE_BUSINESS: 'standard' as const,
    ENTERPRISE: 'express' as const,
  },

  // Required capabilities for accounts
  CAPABILITIES: {
    STANDARD: ['card_payments', 'transfers'],
    EXPRESS: ['card_payments', 'transfers'],
  },

  // Country-specific settings
  DEFAULT_COUNTRY: 'US',
  DEFAULT_CURRENCY: 'usd',

  // Onboarding settings
  REFRESH_URL: process.env.NEXT_PUBLIC_APP_URL + '/payments/connect/refresh',
  RETURN_URL: process.env.NEXT_PUBLIC_APP_URL + '/payments/connect/return',
} as const;

/**
 * Subscription Configuration
 */
export const SUBSCRIPTION_CONFIG = {
  // Default subscription products and prices
  WAREHOUSE_STORAGE: {
    BASIC: {
      priceId: process.env.STRIPE_PRICE_WAREHOUSE_BASIC,
      amount: 9900, // $99/month
      currency: 'usd',
      interval: 'month',
    },
    PRO: {
      priceId: process.env.STRIPE_PRICE_WAREHOUSE_PRO,
      amount: 19900, // $199/month
      currency: 'usd',
      interval: 'month',
    },
    ENTERPRISE: {
      priceId: process.env.STRIPE_PRICE_WAREHOUSE_ENTERPRISE,
      amount: 49900, // $499/month
      currency: 'usd',
      interval: 'month',
    },
  },

  // Usage-based billing for storage
  STORAGE_METERED: {
    priceId: process.env.STRIPE_PRICE_STORAGE_METERED,
    amount: 50, // $0.50 per cubic foot per month
    currency: 'usd',
    interval: 'month',
    usageType: 'metered',
  },

  // Trial periods
  TRIAL_PERIOD_DAYS: 14,

  // Billing settings
  BILLING_CYCLE_ANCHOR: 'start_of_month',
  PRORATE: true,
} as const;

/**
 * Payment Intent Configuration
 */
export const PAYMENT_CONFIG = {
  // Default payment method types
  PAYMENT_METHOD_TYPES: ['card', 'us_bank_account'],

  // Automatic confirmation settings
  CONFIRM_PAYMENT: true,

  // Currency settings
  DEFAULT_CURRENCY: 'usd',

  // Receipt settings
  RECEIPT_EMAIL: true,

  // Metadata limits
  MAX_METADATA_KEYS: 50,
  MAX_METADATA_VALUE_LENGTH: 500,
} as const;

/**
 * Webhook Configuration
 */
export const WEBHOOK_CONFIG = {
  // Events to handle for main account
  MAIN_EVENTS: [
    'customer.created',
    'customer.updated',
    'customer.deleted',
    'payment_method.attached',
    'payment_method.detached',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'subscription.created',
    'subscription.updated',
    'subscription.deleted',
  ],

  // Events to handle for Connect accounts
  CONNECT_EVENTS: [
    'account.updated',
    'capability.updated',
    'person.created',
    'person.updated',
    'payment_intent.succeeded',
    'payment_intent.payment_failed',
    'payout.created',
    'payout.updated',
    'payout.paid',
    'payout.failed',
  ],
} as const;

/**
 * Error handling utilities
 */
export class StripeError extends Error {
  constructor(
    message: string,
    public code?: string,
    public type?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'StripeError';
  }
}

export const handleStripeError = (error: any): StripeError => {
  if (error.type === 'StripeCardError') {
    return new StripeError(
      error.message || 'Your card was declined.',
      error.code,
      'card_error',
      error.statusCode
    );
  }

  if (error.type === 'StripeInvalidRequestError') {
    return new StripeError(
      'Invalid request. Please check your input and try again.',
      error.code,
      'invalid_request_error',
      error.statusCode
    );
  }

  if (error.type === 'StripeAPIError') {
    return new StripeError(
      'An error occurred while processing your payment. Please try again.',
      error.code,
      'api_error',
      error.statusCode
    );
  }

  if (error.type === 'StripeConnectionError') {
    return new StripeError(
      'Network error. Please check your connection and try again.',
      error.code,
      'connection_error',
      error.statusCode
    );
  }

  if (error.type === 'StripeAuthenticationError') {
    return new StripeError(
      'Authentication failed. Please contact support.',
      error.code,
      'authentication_error',
      error.statusCode
    );
  }

  // Generic error
  return new StripeError(
    error.message || 'An unexpected error occurred.',
    error.code,
    'unknown_error',
    error.statusCode || 500
  );
};

/**
 * Utility functions
 */
export const formatAmount = (amount: number, currency = 'usd'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
};

export const parseAmount = (amount: string): number => {
  const parsed = parseFloat(amount.replace(/[^0-9.-]/g, ''));
  return Math.round(parsed * 100); // Convert to cents
};

export const validateWebhookSignature = (
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event => {
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (error) {
    throw new StripeError(
      'Invalid webhook signature',
      'invalid_signature',
      'webhook_error',
      400
    );
  }
};