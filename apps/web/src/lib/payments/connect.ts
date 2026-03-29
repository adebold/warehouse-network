/**
 * Stripe Connect Service
 *
 * This service handles Stripe Connect marketplace functionality including:
 * - Account onboarding for warehouse operators
 * - Payment splitting and commission processing
 * - Account status management and verification
 * - Payout handling and dashboard access
 */

import { stripe, STRIPE_CONNECT_CONFIG, StripeError, handleStripeError } from './stripe';
import { prisma } from '@/lib/db';
import { OrgType } from '@prisma/client';
import Stripe from 'stripe';

export interface ConnectAccountData {
  organizationId: string;
  email: string;
  country?: string;
  businessType?: 'individual' | 'company';
  businessProfile?: {
    name?: string;
    url?: string;
    description?: string;
    mcc?: string; // Merchant Category Code
  };
}

export interface PaymentSplitOptions {
  totalAmount: number;
  platformFeeAmount?: number;
  platformFeePercentage?: number;
  description?: string;
  metadata?: Record<string, string>;
  transferGroup?: string;
}

/**
 * Stripe Connect Account Management
 */
export class StripeConnectService {
  /**
   * Create a new Stripe Connect account for a warehouse operator
   */
  async createConnectAccount(data: ConnectAccountData): Promise<{
    stripeAccountId: string;
    onboardingUrl: string;
    expiresAt: Date;
  }> {
    try {
      // Get organization to determine account type
      const organization = await prisma.organization.findUnique({
        where: { id: data.organizationId },
      });

      if (!organization) {
        throw new StripeError('Organization not found', 'organization_not_found');
      }

      // Determine account type based on organization type
      const accountType = this.getAccountTypeForOrg(organization.type);

      // Create Stripe Connect account
      const account = await stripe.accounts.create({
        type: accountType,
        country: data.country || STRIPE_CONNECT_CONFIG.DEFAULT_COUNTRY,
        email: data.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: data.businessType || 'company',
        business_profile: data.businessProfile,
        metadata: {
          organizationId: data.organizationId,
          orgType: organization.type,
        },
      });

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: STRIPE_CONNECT_CONFIG.REFRESH_URL,
        return_url: STRIPE_CONNECT_CONFIG.RETURN_URL,
        type: 'account_onboarding',
      });

      // Store in database
      const stripeAccount = await prisma.stripeAccount.create({
        data: {
          organizationId: data.organizationId,
          stripeAccountId: account.id,
          accountType: accountType.toUpperCase() as any,
          onboardingUrl: accountLink.url,
          onboardingExpiry: new Date(accountLink.expires_at * 1000),
          country: data.country || STRIPE_CONNECT_CONFIG.DEFAULT_COUNTRY,
          currency: STRIPE_CONNECT_CONFIG.DEFAULT_CURRENCY,
          chargesEnabled: account.charges_enabled,
          payoutsEnabled: account.payouts_enabled,
          detailsSubmitted: account.details_submitted,
          requirements: account.requirements as any,
          capabilities: account.capabilities as any,
        },
      });

      return {
        stripeAccountId: account.id,
        onboardingUrl: accountLink.url,
        expiresAt: new Date(accountLink.expires_at * 1000),
      };
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Refresh the onboarding URL for an existing account
   */
  async refreshOnboardingUrl(organizationId: string): Promise<{
    onboardingUrl: string;
    expiresAt: Date;
  }> {
    try {
      const stripeAccount = await prisma.stripeAccount.findUnique({
        where: { organizationId },
      });

      if (!stripeAccount) {
        throw new StripeError('Stripe account not found', 'account_not_found');
      }

      // Create new account link
      const accountLink = await stripe.accountLinks.create({
        account: stripeAccount.stripeAccountId!,
        refresh_url: STRIPE_CONNECT_CONFIG.REFRESH_URL,
        return_url: STRIPE_CONNECT_CONFIG.RETURN_URL,
        type: 'account_onboarding',
      });

      // Update database
      await prisma.stripeAccount.update({
        where: { organizationId },
        data: {
          onboardingUrl: accountLink.url,
          onboardingExpiry: new Date(accountLink.expires_at * 1000),
        },
      });

      return {
        onboardingUrl: accountLink.url,
        expiresAt: new Date(accountLink.expires_at * 1000),
      };
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Get dashboard URL for account management
   */
  async getDashboardUrl(organizationId: string): Promise<string> {
    try {
      const stripeAccount = await prisma.stripeAccount.findUnique({
        where: { organizationId },
      });

      if (!stripeAccount) {
        throw new StripeError('Stripe account not found', 'account_not_found');
      }

      const loginLink = await stripe.accounts.createLoginLink(
        stripeAccount.stripeAccountId!
      );

      // Update database with dashboard URL
      await prisma.stripeAccount.update({
        where: { organizationId },
        data: { dashboardUrl: loginLink.url },
      });

      return loginLink.url;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Update account status from webhook events
   */
  async updateAccountStatus(accountId: string, accountData: Stripe.Account): Promise<void> {
    try {
      await prisma.stripeAccount.update({
        where: { stripeAccountId: accountId },
        data: {
          chargesEnabled: accountData.charges_enabled,
          payoutsEnabled: accountData.payouts_enabled,
          detailsSubmitted: accountData.details_submitted,
          requirements: accountData.requirements as any,
          capabilities: accountData.capabilities as any,
          country: accountData.country || undefined,
          currency: accountData.default_currency || undefined,
        },
      });
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Create payment with automatic platform fee splitting
   */
  async createPaymentWithSplit(
    customerId: string,
    destinationAccountId: string,
    options: PaymentSplitOptions
  ): Promise<Stripe.PaymentIntent> {
    try {
      const platformFeeAmount = options.platformFeeAmount ||
        Math.round(options.totalAmount * (options.platformFeePercentage || STRIPE_CONNECT_CONFIG.PLATFORM_FEE_PERCENTAGE)) +
        STRIPE_CONNECT_CONFIG.PLATFORM_FEE_FIXED;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: options.totalAmount,
        currency: STRIPE_CONNECT_CONFIG.DEFAULT_CURRENCY,
        customer: customerId,
        application_fee_amount: platformFeeAmount,
        transfer_data: {
          destination: destinationAccountId,
        },
        transfer_group: options.transferGroup,
        description: options.description,
        metadata: options.metadata || {},
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return paymentIntent;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Create payment on behalf of connected account (direct charges)
   */
  async createDirectPayment(
    customerId: string,
    destinationAccountId: string,
    options: PaymentSplitOptions
  ): Promise<Stripe.PaymentIntent> {
    try {
      const platformFeeAmount = options.platformFeeAmount ||
        Math.round(options.totalAmount * (options.platformFeePercentage || STRIPE_CONNECT_CONFIG.PLATFORM_FEE_PERCENTAGE)) +
        STRIPE_CONNECT_CONFIG.PLATFORM_FEE_FIXED;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: options.totalAmount,
        currency: STRIPE_CONNECT_CONFIG.DEFAULT_CURRENCY,
        customer: customerId,
        application_fee_amount: platformFeeAmount,
        description: options.description,
        metadata: options.metadata || {},
        automatic_payment_methods: {
          enabled: true,
        },
      }, {
        stripeAccount: destinationAccountId,
      });

      return paymentIntent;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Transfer funds to connected account
   */
  async createTransfer(
    amount: number,
    destinationAccountId: string,
    options?: {
      description?: string;
      metadata?: Record<string, string>;
      transferGroup?: string;
    }
  ): Promise<Stripe.Transfer> {
    try {
      const transfer = await stripe.transfers.create({
        amount,
        currency: STRIPE_CONNECT_CONFIG.DEFAULT_CURRENCY,
        destination: destinationAccountId,
        description: options?.description,
        metadata: options?.metadata || {},
        transfer_group: options?.transferGroup,
      });

      return transfer;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Get account balance for connected account
   */
  async getAccountBalance(accountId: string): Promise<Stripe.Balance> {
    try {
      const balance = await stripe.balance.retrieve({
        stripeAccount: accountId,
      });

      return balance;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * List payouts for connected account
   */
  async listPayouts(
    accountId: string,
    options?: {
      limit?: number;
      starting_after?: string;
      ending_before?: string;
    }
  ): Promise<Stripe.ApiList<Stripe.Payout>> {
    try {
      const payouts = await stripe.payouts.list(options, {
        stripeAccount: accountId,
      });

      return payouts;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Get account information
   */
  async getAccount(accountId: string): Promise<Stripe.Account> {
    try {
      const account = await stripe.accounts.retrieve(accountId);
      return account;
    } catch (error) {
      throw handleStripeError(error);
    }
  }

  /**
   * Private helper methods
   */
  private getAccountTypeForOrg(orgType: OrgType): 'standard' | 'express' {
    switch (orgType) {
      case OrgType.WAREHOUSE:
        return STRIPE_CONNECT_CONFIG.ACCOUNT_TYPES.WAREHOUSE;
      case OrgType.EBIKE_BUSINESS:
        return STRIPE_CONNECT_CONFIG.ACCOUNT_TYPES.EBIKE_BUSINESS;
      case OrgType.ENTERPRISE:
        return STRIPE_CONNECT_CONFIG.ACCOUNT_TYPES.ENTERPRISE;
      default:
        return 'standard';
    }
  }
}

export const connectService = new StripeConnectService();