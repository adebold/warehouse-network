import { 
  CreditCard, 
  Building,
  Shield,
  Lock,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  Loader2
} from 'lucide-react';
import React, { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PaymentSetupStepProps {
  onComplete: () => void;
  onSkip?: () => void;
  isRequired: boolean;
  flowId: string;
  stepId: string;
}

export const PaymentSetupStep: React.FC<PaymentSetupStepProps> = ({
  onComplete,
  onSkip,
  isRequired
}) => {
  const [paymentMethods, setPaymentMethods] = useState([
    {
      id: '1',
      type: 'credit_card',
      last4: '4242',
      brand: 'Visa',
      expMonth: 12,
      expYear: 2025,
      isDefault: true
    }
  ]);

  const [newCard, setNewCard] = useState({
    cardNumber: '',
    expiryDate: '',
    cvc: '',
    nameOnCard: '',
    billingAddress: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'US'
    }
  });

  const [billingInfo, setBillingInfo] = useState({
    companyName: '',
    taxId: '',
    billingEmail: '',
    invoicePreference: 'email'
  });

  const [showAddCard, setShowAddCard] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [autoPayEnabled, setAutoPayEnabled] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateCard = () => {
    const newErrors: Record<string, string> = {};

    if (!newCard.cardNumber || newCard.cardNumber.replace(/\s/g, '').length < 16) {
      newErrors.cardNumber = 'Please enter a valid card number';
    }

    if (!newCard.expiryDate || !/^\d{2}\/\d{2}$/.test(newCard.expiryDate)) {
      newErrors.expiryDate = 'Please enter expiry date in MM/YY format';
    }

    if (!newCard.cvc || newCard.cvc.length < 3) {
      newErrors.cvc = 'Please enter a valid CVC';
    }

    if (!newCard.nameOnCard.trim()) {
      newErrors.nameOnCard = 'Please enter the name on card';
    }

    if (!newCard.billingAddress.street.trim()) {
      newErrors.street = 'Please enter billing address';
    }

    if (!newCard.billingAddress.city.trim()) {
      newErrors.city = 'Please enter city';
    }

    if (!newCard.billingAddress.zipCode.trim()) {
      newErrors.zipCode = 'Please enter ZIP code';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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

  const formatExpiryDate = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCardNumber(e.target.value);
    if (formatted.length <= 19) {
      setNewCard(prev => ({ ...prev, cardNumber: formatted }));
    }
  };

  const handleExpiryDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatExpiryDate(e.target.value);
    if (formatted.length <= 5) {
      setNewCard(prev => ({ ...prev, expiryDate: formatted }));
    }
  };

  const handleAddCard = async () => {
    if (!validateCard()) {return;}

    setIsLoading(true);

    try {
      // Simulate API call to add payment method
      await new Promise(resolve => setTimeout(resolve, 2000));

      const newPaymentMethod = {
        id: Date.now().toString(),
        type: 'credit_card',
        last4: newCard.cardNumber.slice(-4),
        brand: 'Visa', // In real implementation, detect from card number
        expMonth: parseInt(newCard.expiryDate.split('/')[0]),
        expYear: 2000 + parseInt(newCard.expiryDate.split('/')[1]),
        isDefault: paymentMethods.length === 0
      };

      setPaymentMethods(prev => [...prev, newPaymentMethod]);
      setShowAddCard(false);
      
      // Reset form
      setNewCard({
        cardNumber: '',
        expiryDate: '',
        cvc: '',
        nameOnCard: '',
        billingAddress: {
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'US'
        }
      });
    } catch (error) {
      console.error('Failed to add payment method:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveCard = (cardId: string) => {
    setPaymentMethods(prev => prev.filter(card => card.id !== cardId));
  };

  const handleSetDefault = (cardId: string) => {
    setPaymentMethods(prev => 
      prev.map(card => ({
        ...card,
        isDefault: card.id === cardId
      }))
    );
  };

  const handleComplete = async () => {
    if (paymentMethods.length === 0 && isRequired) {
      alert('Please add at least one payment method');
      return;
    }

    setIsLoading(true);

    try {
      // Save payment setup
      const response = await fetch('/api/user/payment-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethods,
          billingInfo,
          autoPayEnabled
        })
      });

      if (response.ok) {
        onComplete();
      }
    } catch (error) {
      console.error('Failed to save payment setup:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
          <CreditCard className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-2xl font-bold">Setup Payment Methods</h2>
        <p className="text-muted-foreground">
          Add payment methods to easily book and pay for warehouse space
        </p>
      </div>

      {/* Security Notice */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">Secure Payment Processing</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Your payment information is encrypted and processed securely through Stripe. 
                We never store your full card details on our servers.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing Payment Methods */}
      {paymentMethods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Methods
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-6 bg-gradient-to-r from-blue-600 to-purple-600 rounded flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {method.brand} •••• {method.last4}
                      </span>
                      {method.isDefault && (
                        <Badge variant="secondary">Default</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Expires {method.expMonth}/{method.expYear}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!method.isDefault && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetDefault(method.id)}
                    >
                      Set Default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveCard(method.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Add New Card */}
      {!showAddCard ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-6 text-center">
            <Plus className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <h3 className="font-medium mb-2">Add Payment Method</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Add a credit card or bank account for easy payments
            </p>
            <Button onClick={() => setShowAddCard(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Payment Method
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Add New Card
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAddCard(false)}
              >
                Cancel
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="cardNumber">Card Number</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="cardNumber"
                    placeholder="1234 5678 9012 3456"
                    value={newCard.cardNumber}
                    onChange={handleCardNumberChange}
                    className={`pl-10 ${errors.cardNumber ? 'border-red-500' : ''}`}
                    maxLength={19}
                  />
                </div>
                {errors.cardNumber && (
                  <p className="text-sm text-red-500">{errors.cardNumber}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiryDate">Expiry Date</Label>
                <Input
                  id="expiryDate"
                  placeholder="MM/YY"
                  value={newCard.expiryDate}
                  onChange={handleExpiryDateChange}
                  className={errors.expiryDate ? 'border-red-500' : ''}
                  maxLength={5}
                />
                {errors.expiryDate && (
                  <p className="text-sm text-red-500">{errors.expiryDate}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="cvc">CVC</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="cvc"
                    placeholder="123"
                    value={newCard.cvc}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      if (value.length <= 4) {
                        setNewCard(prev => ({ ...prev, cvc: value }));
                      }
                    }}
                    className={`pl-10 ${errors.cvc ? 'border-red-500' : ''}`}
                  />
                </div>
                {errors.cvc && (
                  <p className="text-sm text-red-500">{errors.cvc}</p>
                )}
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="nameOnCard">Name on Card</Label>
                <Input
                  id="nameOnCard"
                  placeholder="John Doe"
                  value={newCard.nameOnCard}
                  onChange={(e) => setNewCard(prev => ({ ...prev, nameOnCard: e.target.value }))}
                  className={errors.nameOnCard ? 'border-red-500' : ''}
                />
                {errors.nameOnCard && (
                  <p className="text-sm text-red-500">{errors.nameOnCard}</p>
                )}
              </div>
            </div>

            {/* Billing Address */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium flex items-center gap-2">
                <Building className="h-4 w-4" />
                Billing Address
              </h4>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="street">Street Address</Label>
                  <Input
                    id="street"
                    placeholder="123 Main St"
                    value={newCard.billingAddress.street}
                    onChange={(e) => setNewCard(prev => ({
                      ...prev,
                      billingAddress: { ...prev.billingAddress, street: e.target.value }
                    }))}
                    className={errors.street ? 'border-red-500' : ''}
                  />
                  {errors.street && (
                    <p className="text-sm text-red-500">{errors.street}</p>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="New York"
                      value={newCard.billingAddress.city}
                      onChange={(e) => setNewCard(prev => ({
                        ...prev,
                        billingAddress: { ...prev.billingAddress, city: e.target.value }
                      }))}
                      className={errors.city ? 'border-red-500' : ''}
                    />
                    {errors.city && (
                      <p className="text-sm text-red-500">{errors.city}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Select 
                      value={newCard.billingAddress.state}
                      onValueChange={(value) => setNewCard(prev => ({
                        ...prev,
                        billingAddress: { ...prev.billingAddress, state: value }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NY">New York</SelectItem>
                        <SelectItem value="CA">California</SelectItem>
                        <SelectItem value="TX">Texas</SelectItem>
                        <SelectItem value="FL">Florida</SelectItem>
                        {/* Add more states as needed */}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zipCode">ZIP Code</Label>
                    <Input
                      id="zipCode"
                      placeholder="10001"
                      value={newCard.billingAddress.zipCode}
                      onChange={(e) => setNewCard(prev => ({
                        ...prev,
                        billingAddress: { ...prev.billingAddress, zipCode: e.target.value }
                      }))}
                      className={errors.zipCode ? 'border-red-500' : ''}
                    />
                    {errors.zipCode && (
                      <p className="text-sm text-red-500">{errors.zipCode}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Button
              onClick={handleAddCard}
              disabled={isLoading}
              className="w-full gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding Card...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Card
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Billing Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Billing Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="autoPay"
              checked={autoPayEnabled}
              onCheckedChange={(checked) => setAutoPayEnabled(checked === true)}
            />
            <div>
              <Label htmlFor="autoPay" className="font-medium">
                Enable Automatic Payments
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically charge your default payment method when invoices are due
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warning for required step */}
      {isRequired && paymentMethods.length === 0 && (
        <div className="flex items-start gap-3 p-4 border border-orange-200 rounded-lg bg-orange-50 dark:bg-orange-900/20">
          <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-orange-900 dark:text-orange-100">
              Payment Method Required
            </h4>
            <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
              You'll need to add at least one payment method to complete your setup and start booking warehouse space.
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-4">
        {!isRequired && onSkip && (
          <Button onClick={onSkip} variant="outline" size="lg">
            Skip for Now
          </Button>
        )}
        
        <Button 
          onClick={handleComplete}
          disabled={isLoading || (isRequired && paymentMethods.length === 0)}
          size="lg"
          className="px-8 gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4" />
              Complete Payment Setup
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default PaymentSetupStep;