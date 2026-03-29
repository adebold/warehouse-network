/**
 * Mobile Payment Component
 * Provides mobile-optimized payment processing with touch-friendly interfaces
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Smartphone,
  Fingerprint,
  Lock,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Scan,
  NfcIcon,
  Shield,
  Eye,
  EyeOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MobilePaymentProps {
  amount: number;
  description?: string;
  onSuccess: (paymentResult: PaymentResult) => void;
  onError: (error: string) => void;
  onCancel: () => void;
  allowedMethods?: PaymentMethod[];
  className?: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: React.ElementType;
  supported: boolean;
  description: string;
}

interface PaymentResult {
  id: string;
  method: string;
  amount: number;
  currency: string;
  timestamp: Date;
  transactionId: string;
}

interface BiometricStatus {
  available: boolean;
  enrolled: boolean;
  type: 'fingerprint' | 'face' | 'none';
}

interface PaymentRequest {
  amount: number;
  currency: string;
  method: string;
  billingDetails?: {
    name?: string;
    email?: string;
    address?: {
      line1?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country?: string;
    };
  };
}

const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'card',
    name: 'Credit/Debit Card',
    icon: CreditCard,
    supported: true,
    description: 'Visa, Mastercard, American Express'
  },
  {
    id: 'apple_pay',
    name: 'Apple Pay',
    icon: Smartphone,
    supported: false, // Will be detected
    description: 'Pay with Touch ID or Face ID'
  },
  {
    id: 'google_pay',
    name: 'Google Pay',
    icon: Smartphone,
    supported: false, // Will be detected
    description: 'Pay with your Google account'
  },
  {
    id: 'nfc',
    name: 'Contactless',
    icon: NfcIcon,
    supported: false, // Will be detected
    description: 'Tap to pay with NFC'
  }
];

export function MobilePayment({
  amount,
  description = 'Payment',
  onSuccess,
  onError,
  onCancel,
  allowedMethods = DEFAULT_PAYMENT_METHODS,
  className
}: MobilePaymentProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(allowedMethods);
  const [selectedMethod, setSelectedMethod] = useState<string>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCardForm, setShowCardForm] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>({
    available: false,
    enrolled: false,
    type: 'none'
  });

  // Card form state
  const [cardData, setCardData] = useState({
    number: '',
    expiry: '',
    cvc: '',
    name: '',
    showCvc: false
  });

  // Detect available payment methods
  useEffect(() => {
    detectPaymentMethods();
    detectBiometrics();
  }, []);

  const detectPaymentMethods = async () => {
    const updatedMethods = [...allowedMethods];

    try {
      // Check for Payment Request API support
      if ('PaymentRequest' in window) {
        const supportedMethods = [
          {
            supportedMethods: 'https://apple.com/apple-pay',
            data: {
              version: 3,
              merchantIdentifier: 'merchant.com.skidspace',
              countryCode: 'US',
              currencyCode: 'USD'
            }
          },
          {
            supportedMethods: 'https://google.com/pay',
            data: {
              environment: process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'TEST',
              merchantId: process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID
            }
          }
        ];

        try {
          const paymentRequest = new PaymentRequest(
            supportedMethods,
            {
              total: {
                label: 'Test',
                amount: { currency: 'USD', value: '0.01' }
              }
            }
          );

          const canMakePayment = await paymentRequest.canMakePayment();

          if (canMakePayment) {
            const applePayIndex = updatedMethods.findIndex(m => m.id === 'apple_pay');
            const googlePayIndex = updatedMethods.findIndex(m => m.id === 'google_pay');

            if (applePayIndex !== -1) {
              updatedMethods[applePayIndex].supported = true;
            }
            if (googlePayIndex !== -1) {
              updatedMethods[googlePayIndex].supported = true;
            }
          }
        } catch (error) {
          console.log('Payment Request API not fully supported');
        }
      }

      // Check for NFC support
      if ('NDEFReader' in window) {
        const nfcIndex = updatedMethods.findIndex(m => m.id === 'nfc');
        if (nfcIndex !== -1) {
          updatedMethods[nfcIndex].supported = true;
        }
      }

    } catch (error) {
      console.error('Error detecting payment methods:', error);
    }

    setPaymentMethods(updatedMethods);

    // Set default to first supported method
    const firstSupported = updatedMethods.find(m => m.supported);
    if (firstSupported) {
      setSelectedMethod(firstSupported.id);
    }
  };

  const detectBiometrics = async () => {
    try {
      // Check for Web Authentication API
      if ('credentials' in navigator && 'create' in navigator.credentials) {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

        setBiometricStatus({
          available,
          enrolled: available, // Simplified check
          type: 'fingerprint' // Could be face on some devices
        });
      }
    } catch (error) {
      console.error('Biometric detection failed:', error);
    }
  };

  const handlePayment = useCallback(async () => {
    setIsProcessing(true);

    try {
      const paymentData: PaymentRequest = {
        amount,
        currency: 'USD',
        method: selectedMethod
      };

      let result: PaymentResult;

      switch (selectedMethod) {
        case 'card':
          result = await processCardPayment(paymentData);
          break;
        case 'apple_pay':
        case 'google_pay':
          result = await processDigitalWalletPayment(paymentData);
          break;
        case 'nfc':
          result = await processNfcPayment(paymentData);
          break;
        default:
          throw new Error('Unsupported payment method');
      }

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      onSuccess(result);

    } catch (error) {
      console.error('Payment failed:', error);
      onError(error instanceof Error ? error.message : 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedMethod, amount, onSuccess, onError, cardData]);

  const processCardPayment = async (paymentData: PaymentRequest): Promise<PaymentResult> => {
    // Validate card data
    if (!cardData.number || !cardData.expiry || !cardData.cvc || !cardData.name) {
      throw new Error('Please fill in all card details');
    }

    // Call your payment processor (Stripe, etc.)
    const response = await fetch('/api/payments/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...paymentData,
        card: {
          number: cardData.number.replace(/\s/g, ''),
          expiry: cardData.expiry,
          cvc: cardData.cvc,
          name: cardData.name
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Card payment failed');
    }

    const result = await response.json();

    return {
      id: result.id,
      method: 'card',
      amount: paymentData.amount,
      currency: paymentData.currency,
      timestamp: new Date(),
      transactionId: result.transaction_id
    };
  };

  const processDigitalWalletPayment = async (paymentData: PaymentRequest): Promise<PaymentResult> => {
    if (!('PaymentRequest' in window)) {
      throw new Error('Digital wallet payments not supported');
    }

    const supportedMethods = selectedMethod === 'apple_pay'
      ? ['https://apple.com/apple-pay']
      : ['https://google.com/pay'];

    const paymentRequest = new PaymentRequest(
      supportedMethods.map(method => ({ supportedMethods: method })),
      {
        total: {
          label: description,
          amount: {
            currency: paymentData.currency,
            value: paymentData.amount.toFixed(2)
          }
        }
      }
    );

    const paymentResponse = await paymentRequest.show();
    await paymentResponse.complete('success');

    return {
      id: `${selectedMethod}_${Date.now()}`,
      method: selectedMethod,
      amount: paymentData.amount,
      currency: paymentData.currency,
      timestamp: new Date(),
      transactionId: paymentResponse.requestId || `tx_${Date.now()}`
    };
  };

  const processNfcPayment = async (paymentData: PaymentRequest): Promise<PaymentResult> => {
    if (!('NDEFReader' in window)) {
      throw new Error('NFC not supported on this device');
    }

    // This is a simplified NFC payment flow
    // In practice, you'd integrate with NFC payment terminals
    await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate NFC read

    return {
      id: `nfc_${Date.now()}`,
      method: 'nfc',
      amount: paymentData.amount,
      currency: paymentData.currency,
      timestamp: new Date(),
      transactionId: `nfc_tx_${Date.now()}`
    };
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = matches && matches[0] || '';
    const parts = [];
    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }
    if (parts.length) {
      return parts.join(' ');
    } else {
      return v;
    }
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  const handleMethodChange = (methodId: string) => {
    setSelectedMethod(methodId);
    setShowCardForm(methodId === 'card');
  };

  const requiresBiometric = ['apple_pay', 'google_pay'].includes(selectedMethod);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Payment Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span>Payment</span>
            <Badge variant="secondary" className="text-lg font-bold">
              ${amount.toFixed(2)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{description}</p>
        </CardContent>
      </Card>

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment Method</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={selectedMethod}
            onValueChange={handleMethodChange}
            className="space-y-3"
          >
            {paymentMethods.filter(method => method.supported).map((method) => (
              <div key={method.id} className="flex items-start space-x-3">
                <RadioGroupItem
                  value={method.id}
                  id={method.id}
                  className="mt-1"
                />
                <Label
                  htmlFor={method.id}
                  className="flex-1 flex items-center justify-between cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <method.icon className="w-6 h-6" />
                    <div>
                      <div className="font-medium">{method.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {method.description}
                      </div>
                    </div>
                  </div>
                  {requiresBiometric && method.id === selectedMethod && biometricStatus.available && (
                    <Fingerprint className="w-5 h-5 text-primary" />
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Card Form */}
      {selectedMethod === 'card' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Card Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="card-number">Card Number</Label>
              <Input
                id="card-number"
                type="text"
                placeholder="1234 5678 9012 3456"
                value={cardData.number}
                onChange={(e) => setCardData(prev => ({
                  ...prev,
                  number: formatCardNumber(e.target.value)
                }))}
                maxLength={19}
                className="text-lg tracking-wider font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expiry">Expiry Date</Label>
                <Input
                  id="expiry"
                  type="text"
                  placeholder="MM/YY"
                  value={cardData.expiry}
                  onChange={(e) => setCardData(prev => ({
                    ...prev,
                    expiry: formatExpiry(e.target.value)
                  }))}
                  maxLength={5}
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cvc">CVC</Label>
                <div className="relative">
                  <Input
                    id="cvc"
                    type={cardData.showCvc ? "text" : "password"}
                    placeholder="123"
                    value={cardData.cvc}
                    onChange={(e) => setCardData(prev => ({
                      ...prev,
                      cvc: e.target.value.replace(/\D/g, '').slice(0, 4)
                    }))}
                    maxLength={4}
                    className="font-mono pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                    onClick={() => setCardData(prev => ({
                      ...prev,
                      showCvc: !prev.showCvc
                    }))}
                  >
                    {cardData.showCvc ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Cardholder Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                value={cardData.name}
                onChange={(e) => setCardData(prev => ({
                  ...prev,
                  name: e.target.value.toUpperCase()
                }))}
                className="uppercase"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Security Notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Your payment is secured with industry-standard encryption. We never store your card details.
        </AlertDescription>
      </Alert>

      {/* Action Buttons */}
      <div className="space-y-3">
        <Button
          onClick={handlePayment}
          disabled={isProcessing}
          className="w-full h-12 text-lg"
          size="lg"
        >
          {isProcessing ? (
            <div className="flex items-center gap-2">
              <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              Processing...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Pay ${amount.toFixed(2)}
            </div>
          )}
        </Button>

        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          className="w-full"
        >
          Cancel
        </Button>
      </div>

      {/* Biometric Prompt */}
      {requiresBiometric && selectedMethod !== 'card' && biometricStatus.available && (
        <Alert>
          <Fingerprint className="h-4 w-4" />
          <AlertDescription>
            Complete payment using your device's biometric authentication.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export default MobilePayment;