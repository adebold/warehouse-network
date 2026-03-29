'use client';

/**
 * Payment Form Component
 *
 * Secure payment form using Stripe Elements for:
 * - Credit card payments
 * - Payment intent confirmation
 * - Error handling and validation
 * - Support for marketplace payments
 */

import React, { useState, useEffect } from 'react';
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, AlertCircle, CheckCircle } from 'lucide-react';
import { formatAmount } from '@/lib/payments/stripe';

interface PaymentFormProps {
  amount: number;
  currency?: string;
  description?: string;
  customerId?: string;
  destinationAccountId?: string; // For marketplace payments
  applicationFeeAmount?: number;
  metadata?: Record<string, string>;
  onSuccess?: (paymentIntent: any) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
}

interface PaymentFormInternalProps extends PaymentFormProps {
  clientSecret: string;
}

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function PaymentFormInternal({
  amount,
  currency = 'usd',
  description,
  clientSecret,
  onSuccess,
  onError,
  onCancel,
}: PaymentFormInternalProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });

      if (confirmError) {
        setError(confirmError.message || 'Payment failed');
        onError?.(confirmError.message || 'Payment failed');
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        setSucceeded(true);
        onSuccess?.(paymentIntent);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (succeeded) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-900">Payment Successful!</h3>
              <p className="text-sm text-green-700">
                Your payment of {formatAmount(amount, currency)} has been processed successfully.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Payment Details
        </CardTitle>
        {description && (
          <CardDescription>{description}</CardDescription>
        )}
        <div className="text-2xl font-bold">
          {formatAmount(amount, currency)}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <PaymentElement
              options={{
                layout: 'tabs',
              }}
            />
          </div>

          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={!stripe || loading}
              className="flex-1"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Processing...' : `Pay ${formatAmount(amount, currency)}`}
            </Button>

            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function PaymentForm({
  amount,
  currency = 'usd',
  description,
  customerId,
  destinationAccountId,
  applicationFeeAmount,
  metadata,
  onSuccess,
  onError,
  onCancel,
}: PaymentFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createPaymentIntent();
  }, [amount, customerId, destinationAccountId, applicationFeeAmount]);

  const createPaymentIntent = async () => {
    try {
      setLoading(true);
      setError(null);

      // First create or get customer if not provided
      let finalCustomerId = customerId;
      if (!finalCustomerId) {
        const customerResponse = await fetch('/api/payments/create-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'customer@example.com', // This should come from user input
            name: 'Customer Name', // This should come from user input
          }),
        });

        if (customerResponse.ok) {
          const customerData = await customerResponse.json();
          finalCustomerId = customerData.customerId;
        } else {
          throw new Error('Failed to create customer');
        }
      }

      // Create payment intent
      const response = await fetch('/api/payments/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          currency,
          description,
          customerId: finalCustomerId,
          destinationAccountId,
          applicationFeeAmount,
          metadata,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setClientSecret(data.clientSecret);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create payment intent');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize payment';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Initializing payment...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button
            onClick={createPaymentIntent}
            variant="outline"
            className="mt-4 w-full"
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!clientSecret) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">
            Unable to initialize payment
          </div>
        </CardContent>
      </Card>
    );
  }

  const elementsOptions: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#0570de',
        colorBackground: '#ffffff',
        colorText: '#30313d',
        colorDanger: '#df1b41',
        fontFamily: 'system-ui, sans-serif',
        spacingUnit: '2px',
        borderRadius: '6px',
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <PaymentFormInternal
        amount={amount}
        currency={currency}
        description={description}
        clientSecret={clientSecret}
        onSuccess={onSuccess}
        onError={onError}
        onCancel={onCancel}
      />
    </Elements>
  );
}