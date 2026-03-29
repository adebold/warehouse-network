'use client';

/**
 * Stripe Connect Onboarding Component
 *
 * Handles Stripe Connect account creation and onboarding for warehouse operators:
 * - Account creation flow
 * - Onboarding link generation
 * - Account status monitoring
 * - Dashboard access
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  CreditCard,
  Building,
  Globe,
  DollarSign
} from 'lucide-react';

interface ConnectAccountStatus {
  stripeAccountId?: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirements?: {
    currently_due: string[];
    eventually_due: string[];
    past_due: string[];
  };
}

interface ConnectOnboardingProps {
  organizationId: string;
  organizationName: string;
  organizationType: 'WAREHOUSE' | 'EBIKE_BUSINESS' | 'ENTERPRISE';
  onSuccess?: () => void;
}

export function ConnectOnboarding({
  organizationId,
  organizationName,
  organizationType,
  onSuccess,
}: ConnectOnboardingProps) {
  const [accountStatus, setAccountStatus] = useState<ConnectAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('US');
  const [businessType, setBusinessType] = useState<'individual' | 'company'>('company');
  const [businessName, setBusinessName] = useState(organizationName);
  const [businessUrl, setBusinessUrl] = useState('');

  useEffect(() => {
    checkAccountStatus();
  }, [organizationId]);

  const checkAccountStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/payments/connect/status?organizationId=${organizationId}`);

      if (response.ok) {
        const data = await response.json();
        setAccountStatus(data);
      } else if (response.status !== 404) {
        // 404 means no account exists yet, which is fine
        throw new Error('Failed to check account status');
      }
    } catch (err) {
      console.error('Error checking account status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      setError('Email address is required');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/payments/connect/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          email,
          country,
          businessType,
          businessProfile: {
            name: businessName,
            url: businessUrl || undefined,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Redirect to Stripe onboarding
        window.location.href = data.onboardingUrl;
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create account');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDashboard = async () => {
    try {
      const response = await fetch('/api/payments/connect/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId }),
      });

      if (response.ok) {
        const data = await response.json();
        window.open(data.dashboardUrl, '_blank');
      } else {
        setError('Failed to open dashboard');
      }
    } catch (err) {
      setError('Failed to open dashboard');
    }
  };

  const getAccountStatusBadge = (status: ConnectAccountStatus) => {
    if (status.detailsSubmitted && status.chargesEnabled && status.payoutsEnabled) {
      return (
        <Badge variant="default" className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          Fully Active
        </Badge>
      );
    } else if (status.detailsSubmitted) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Under Review
        </Badge>
      );
    } else {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Incomplete
        </Badge>
      );
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-y-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Checking account status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Account already exists and is fully set up
  if (accountStatus?.detailsSubmitted && accountStatus.chargesEnabled) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Stripe Connect Account
              </CardTitle>
              <CardDescription>
                Your payment processing account is set up and ready
              </CardDescription>
            </div>
            {getAccountStatusBadge(accountStatus)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                accountStatus.chargesEnabled ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-sm">Accept Payments</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                accountStatus.payoutsEnabled ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-sm">Receive Payouts</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                accountStatus.detailsSubmitted ? 'bg-green-500' : 'bg-yellow-500'
              }`} />
              <span className="text-sm">Verification Complete</span>
            </div>
          </div>

          {accountStatus.requirements && accountStatus.requirements.currently_due.length > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Some additional information is required to complete your account setup.
                Please check your Stripe dashboard for details.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-4">
            <Button onClick={handleOpenDashboard} className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4" />
              Open Stripe Dashboard
            </Button>
            <Button variant="outline" onClick={checkAccountStatus}>
              Refresh Status
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show onboarding form for new accounts
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building className="w-5 h-5" />
          Set Up Payment Processing
        </CardTitle>
        <CardDescription>
          Create a Stripe Connect account to accept payments and receive payouts
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleCreateAccount} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Business Email Address *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="payments@yourcompany.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country *</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">United States</SelectItem>
                  <SelectItem value="CA">Canada</SelectItem>
                  <SelectItem value="GB">United Kingdom</SelectItem>
                  <SelectItem value="AU">Australia</SelectItem>
                  {/* Add more countries as needed */}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessType">Business Type</Label>
              <Select value={businessType} onValueChange={(value: 'individual' | 'company') => setBusinessType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your Business Name"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="businessUrl">Business Website (Optional)</Label>
              <Input
                id="businessUrl"
                type="url"
                value={businessUrl}
                onChange={(e) => setBusinessUrl(e.target.value)}
                placeholder="https://yourcompany.com"
              />
            </div>
          </div>

          {/* Information about the process */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4" />
              What happens next?
            </h4>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>You'll be redirected to Stripe to complete account setup</li>
              <li>Provide business information and verify your identity</li>
              <li>Connect your bank account for payouts</li>
              <li>Start accepting payments once approved (typically within 24 hours)</li>
            </ul>
          </div>

          {/* Fees information */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4" />
              Processing Fees
            </h4>
            <div className="text-sm text-gray-700 space-y-1">
              <p>• Stripe processing: 2.9% + $0.30 per transaction</p>
              <p>• Platform fee: 2.9% of transaction amount</p>
              <p>• Payouts: Typically within 2 business days</p>
            </div>
          </div>

          <Button
            type="submit"
            disabled={submitting || !email}
            className="w-full"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitting ? 'Creating Account...' : 'Continue with Stripe'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}