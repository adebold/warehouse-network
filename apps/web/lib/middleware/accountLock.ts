
import { NextApiRequest, NextApiResponse } from 'next';

import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface AccountLockCheck {
  allowed: boolean;
  reason?: string;
  customer?: {
    id: string;
    name: string;
    accountStatus: string;
    paymentStatus: string;
    lockReason?: string;
  };
}

export async function checkAccountLock(
  customerId: string,
  operation: 'RECEIVE' | 'RELEASE' | 'CREATE_RFQ' | 'CREATE_ORDER'
): Promise<AccountLockCheck> {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        accountStatus: true,
        paymentStatus: true,
        lockReason: true,
      },
    });

    if (!customer) {
      return {
        allowed: false,
        reason: 'Customer not found',
      };
    }

    // Check if account is locked
    if (customer.accountStatus === 'LOCKED') {
      const operationMessages = {
        RECEIVE: 'receive new inventory',
        RELEASE: 'release inventory',
        CREATE_RFQ: 'create new RFQs',
        CREATE_ORDER: 'create new orders',
      };

      return {
        allowed: false,
        reason: `Account is locked. Customer cannot ${operationMessages[operation]}. ${
          customer.lockReason ? `Reason: ${customer.lockReason}` : ''
        }`,
        customer,
      };
    }

    // Check if account is suspended
    if (customer.accountStatus === 'SUSPENDED') {
      // Allow viewing but not creating/modifying
      if (operation === 'RECEIVE' || operation === 'RELEASE') {
        return {
          allowed: false,
          reason: 'Account is suspended. Limited operations only.',
          customer,
        };
      }
    }

    // Additional checks based on payment status
    if (customer.paymentStatus === 'DELINQUENT' && operation === 'RECEIVE') {
      return {
        allowed: false,
        reason: 'Cannot receive new inventory due to delinquent payment status.',
        customer,
      };
    }

    return {
      allowed: true,
      customer,
    };
  } catch (error) {
    logger.error('Error checking account lock:', error);
    return {
      allowed: false,
      reason: 'Error checking account status',
    };
  }
}

// Middleware function for API routes
export function withAccountLockCheck(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
  operation: 'RECEIVE' | 'RELEASE' | 'CREATE_RFQ' | 'CREATE_ORDER'
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Extract customerId from various possible locations
    const customerId = req.body.customerId || req.query.customerId || req.body.customer?.id;

    if (!customerId) {
      return res.status(400).json({
        message: 'Customer ID is required',
        error: 'MISSING_CUSTOMER_ID',
      });
    }

    const lockCheck = await checkAccountLock(customerId, operation);

    if (!lockCheck.allowed) {
      return res.status(403).json({
        message: lockCheck.reason,
        error: 'ACCOUNT_LOCKED',
        customer: lockCheck.customer,
      });
    }

    // Add the lock check result to the request for use in the handler
    (req as any).accountLockCheck = lockCheck;

    return handler(req, res);
  };
}
