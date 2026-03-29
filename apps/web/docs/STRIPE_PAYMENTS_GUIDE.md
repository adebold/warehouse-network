# Stripe Payments Integration Guide

## Overview

This document provides comprehensive information about the Stripe payments integration for the Skidspace warehouse marketplace platform. The system supports:

- **Stripe Connect Marketplace**: Multi-party payments with automatic commission splitting
- **Subscription Billing**: Recurring payments for warehouse storage fees
- **Customer Payment Processing**: Secure payment flows for ebike orders
- **Webhook Handling**: Real-time event processing for payment status updates
- **Payment Dashboards**: Analytics and management interfaces

## 🏗️ Architecture Overview

### Components

1. **Payment Services** (`src/lib/payments/`)
   - `stripe.ts` - Core Stripe configuration and utilities
   - `connect.ts` - Stripe Connect marketplace functionality
   - `subscriptions.ts` - Subscription billing management
   - `payments.ts` - Customer payment processing
   - `webhooks.ts` - Secure webhook event handling

2. **API Routes** (`src/app/api/payments/`)
   - Payment intent creation and confirmation
   - Customer and payment method management
   - Connect account onboarding
   - Subscription lifecycle management
   - Webhook endpoints with signature verification

3. **React Components** (`src/components/payments/`)
   - `PaymentDashboard` - Analytics and transaction management
   - `PaymentForm` - Secure payment processing with Stripe Elements
   - `ConnectOnboarding` - Warehouse operator account setup

4. **Database Schema** (Prisma models)
   - Complete payment data modeling
   - Audit trail and compliance features
   - Multi-tenant organization support

## 🚀 Quick Setup

### 1. Install Dependencies

Dependencies are already included in `package.json`:
```json
{
  "stripe": "^14.21.0",
  "@stripe/stripe-js": "^2.4.0"
}
```

### 2. Environment Configuration

Copy the example environment file:
```bash
cp .env.stripe.example .env.local
```

Configure your Stripe credentials:
```env
# Test credentials (development)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database Migration

The database schema is already updated with payment models. Run migrations:
```bash
npm run db:migrate
```

### 4. Webhook Setup

#### Development (using Stripe CLI)
```bash
# Install Stripe CLI
npm install -g @stripe/stripe-cli

# Login to your Stripe account
stripe login

# Forward webhooks to local development
stripe listen --forward-to localhost:3000/api/webhooks/stripe
stripe listen --forward-to localhost:3000/api/webhooks/stripe/connect --connect

# Use the webhook secrets provided by the CLI
```

#### Production
1. Configure webhook endpoints in your Stripe dashboard:
   - `https://yourdomain.com/api/webhooks/stripe` (main account events)
   - `https://yourdomain.com/api/webhooks/stripe/connect` (Connect events)

2. Select events to monitor (see configuration in `stripe.ts`)

## 💳 Payment Flows

### 1. Customer Payment Processing

#### Basic Payment Flow
```typescript
import { PaymentForm } from '@/components/payments/PaymentForm';

function CheckoutPage() {
  return (
    <PaymentForm
      amount={2000} // $20.00 in cents
      description="Ebike rental fee"
      onSuccess={(paymentIntent) => {
        console.log('Payment successful:', paymentIntent);
        // Redirect to success page
      }}
      onError={(error) => {
        console.error('Payment failed:', error);
        // Show error message
      }}
    />
  );
}
```

#### Marketplace Payment (with Connect)
```typescript
import { PaymentForm } from '@/components/payments/PaymentForm';

function MarketplaceCheckout() {
  return (
    <PaymentForm
      amount={10000} // $100.00
      destinationAccountId="acct_warehouse123"
      applicationFeeAmount={290} // 2.9% platform fee
      description="Warehouse storage fee"
      metadata={{
        orderId: "order_123",
        warehouseId: "warehouse_456"
      }}
    />
  );
}
```

### 2. Stripe Connect Onboarding

#### Warehouse Operator Setup
```typescript
import { ConnectOnboarding } from '@/components/payments/ConnectOnboarding';

function WarehouseSettings({ organizationId }) {
  return (
    <ConnectOnboarding
      organizationId={organizationId}
      organizationName="ACME Warehouse"
      organizationType="WAREHOUSE"
      onSuccess={() => {
        // Refresh page or update state
        window.location.reload();
      }}
    />
  );
}
```

### 3. Subscription Billing

#### Create Subscription
```typescript
import { subscriptionService } from '@/lib/payments/subscriptions';

async function createStorageSubscription() {
  const result = await subscriptionService.createSubscription({
    customerId: 'cus_customer123',
    priceId: 'price_warehouse_pro',
    trialPeriodDays: 14,
    metadata: {
      warehouseId: 'warehouse_456',
      plan: 'pro'
    }
  });

  return result.subscription;
}
```

#### Usage-Based Billing
```typescript
// Record storage usage
await subscriptionService.recordUsage('sub_subscription123', [
  {
    subscriptionItemId: 'si_item123',
    quantity: 500, // 500 cubic feet stored
    timestamp: Math.floor(Date.now() / 1000)
  }
]);
```

## 🔧 API Reference

### Payment Endpoints

#### POST `/api/payments/create-customer`
Creates or retrieves a Stripe customer.

```typescript
// Request
{
  email: string;
  name?: string;
  phone?: string;
  address?: Address;
  organizationId?: string;
}

// Response
{
  customerId: string;
  email: string;
  name?: string;
  defaultPaymentMethod?: string;
}
```

#### POST `/api/payments/create-payment-intent`
Creates a payment intent for processing.

```typescript
// Request
{
  amount: number; // Amount in cents
  currency?: string;
  customerId: string;
  description?: string;
  destinationAccountId?: string; // For marketplace payments
  applicationFeeAmount?: number;
  metadata?: Record<string, string>;
}

// Response
{
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  status: string;
}
```

### Connect Endpoints

#### POST `/api/payments/connect/onboard`
Creates Connect account and onboarding link.

```typescript
// Request
{
  organizationId: string;
  email: string;
  country?: string;
  businessType?: 'individual' | 'company';
  businessProfile?: {
    name?: string;
    url?: string;
    description?: string;
  };
}

// Response
{
  accountId: string;
  onboardingUrl: string;
  expiresAt: Date;
  existing: boolean;
}
```

### Subscription Endpoints

#### POST `/api/payments/subscriptions/create`
Creates a new subscription.

```typescript
// Request
{
  customerId: string;
  priceId: string;
  trialPeriodDays?: number;
  defaultPaymentMethod?: string;
  metadata?: Record<string, string>;
}

// Response
{
  subscriptionId: string;
  clientSecret?: string;
  status: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  trialEnd?: number;
}
```

## 📊 Payment Dashboard

### Integration Example

```typescript
import { PaymentDashboard } from '@/components/payments/PaymentDashboard';

function OrganizationPayments({ organizationId, userRole }) {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Payment Management</h1>
      <PaymentDashboard
        organizationId={organizationId}
        userRole={userRole} // 'admin', 'manager', or 'viewer'
      />
    </div>
  );
}
```

### Features

- **Real-time Statistics**: Revenue, transaction count, active subscriptions
- **Transaction History**: Detailed payment records with filtering
- **Subscription Management**: View and manage recurring billing
- **Stripe Dashboard Integration**: Direct access to Stripe's interface
- **Export Functionality**: Download payment data for accounting

## 🔒 Security Features

### 1. Webhook Signature Verification
All webhooks are verified using Stripe's signature verification:

```typescript
import { validateWebhookSignature } from '@/lib/payments/stripe';

const event = validateWebhookSignature(
  requestBody,
  stripeSignature,
  webhookSecret
);
```

### 2. PCI Compliance
- **No sensitive card data storage**: All card data handled by Stripe
- **Secure tokenization**: Payment methods tokenized before storage
- **TLS encryption**: All communications encrypted in transit

### 3. Access Controls
- **Role-based permissions**: Different access levels for payment features
- **Organization isolation**: Multi-tenant data segregation
- **Audit logging**: All payment activities logged

### 4. Error Handling
- **Graceful degradation**: Robust error handling for payment failures
- **Retry logic**: Automatic retry for failed webhook processing
- **Monitoring**: Comprehensive error tracking and alerting

## 🧪 Testing

### Unit Tests
Run the payment service tests:
```bash
npm test src/lib/payments/__tests__/
```

### Integration Testing
Use Stripe's test mode and test card numbers:
```typescript
// Test card numbers
const TEST_CARDS = {
  SUCCESS: '4242424242424242',
  DECLINED: '4000000000000002',
  REQUIRES_3DS: '4000002500003155',
  INSUFFICIENT_FUNDS: '4000000000009995'
};
```

### Webhook Testing
Use Stripe CLI for local webhook testing:
```bash
# Test specific events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
stripe trigger account.updated
```

## 🚨 Error Handling

### Common Error Scenarios

1. **Payment Declined**
   ```typescript
   if (error.type === 'card_error') {
     // Show user-friendly message
     setError('Your card was declined. Please try a different payment method.');
   }
   ```

2. **Insufficient Funds**
   ```typescript
   if (error.code === 'insufficient_funds') {
     setError('Insufficient funds. Please check your account balance.');
   }
   ```

3. **Webhook Processing Failure**
   ```typescript
   // Webhooks are automatically retried with exponential backoff
   // Failed events are logged for manual review
   ```

### Monitoring and Alerting
- **Webhook failures**: Monitor failed webhook deliveries
- **Payment failures**: Track declined payment rates
- **Connect issues**: Monitor account onboarding completion rates

## 📈 Analytics and Reporting

### Revenue Tracking
```typescript
// Get revenue analytics
const stats = await fetch(`/api/payments/stats?organizationId=${orgId}`);
const data = await stats.json();

console.log({
  totalRevenue: data.totalRevenue,
  monthlyRevenue: data.monthlyRevenue,
  transactionCount: data.totalTransactions
});
```

### Subscription Metrics
- **MRR (Monthly Recurring Revenue)**: Track subscription revenue
- **Churn Rate**: Monitor subscription cancellations
- **LTV (Lifetime Value)**: Calculate customer value over time

## 🔧 Maintenance and Operations

### Regular Tasks

1. **Monitor Webhook Health**
   ```bash
   # Check for failed webhook events
   stripe events list --type="*" --created="gte:$(date -d '1 day ago' +%s)"
   ```

2. **Review Failed Payments**
   - Analyze decline reasons
   - Contact customers for payment method updates
   - Retry failed charges where appropriate

3. **Reconcile Transactions**
   - Daily reconciliation of Stripe data with internal records
   - Monthly financial reporting and analysis

### Scaling Considerations

1. **Rate Limiting**: Implement proper rate limiting for API endpoints
2. **Webhook Queuing**: Use job queues for heavy webhook processing
3. **Database Optimization**: Index payment tables for performance
4. **Monitoring**: Set up comprehensive monitoring and alerting

## 📞 Support and Troubleshooting

### Common Issues

1. **"Customer not found" errors**
   - Ensure customer is created before payment processing
   - Check customer ID format and validity

2. **Webhook timeout errors**
   - Verify webhook endpoint accessibility
   - Check response times (must be under 30 seconds)
   - Implement proper error handling

3. **Connect onboarding issues**
   - Verify redirect URLs are correct
   - Check account requirements completion
   - Monitor for capability updates

### Getting Help

1. **Stripe Documentation**: https://stripe.com/docs
2. **Stripe Support**: Available through dashboard
3. **Logs**: Check application logs and Stripe dashboard events
4. **Test Mode**: Use test mode for debugging without real money

## 🔄 Deployment Checklist

### Pre-Production

- [ ] Switch to live Stripe API keys
- [ ] Configure production webhook endpoints
- [ ] Verify SSL certificates
- [ ] Set up monitoring and alerting
- [ ] Test all payment flows thoroughly
- [ ] Review security configurations
- [ ] Set up backup systems

### Post-Deployment

- [ ] Monitor initial transactions
- [ ] Verify webhook deliveries
- [ ] Check error rates
- [ ] Validate reporting accuracy
- [ ] Confirm backup systems
- [ ] Document any issues

---

## Summary

This Stripe integration provides a complete payment solution for the Skidspace marketplace platform with enterprise-grade security, comprehensive error handling, and full audit capabilities. The modular architecture allows for easy maintenance and scaling as the platform grows.

For additional questions or custom requirements, consult the Stripe documentation or contact the development team.