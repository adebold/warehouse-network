import type { Customer } from '@warehouse/types';

import { PrismaClient, CustomerAccountStatus } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

const prisma = new PrismaClient();

export interface PaymentControlResult {
  allowed: boolean;
  reason?: string;
  accountStatus?: CustomerAccountStatus;
  requiresOverride?: boolean;
}

export async function checkCustomerPaymentStatus(
  customerId: string
): Promise<PaymentControlResult> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      accountStatus: true,
      paymentStatus: true,
      lockReason: true,
      overdueAmount: true,
    },
  });

  if (!customer) {
    return { allowed: false, reason: 'Customer not found' };
  }

  if (customer.accountStatus === 'LOCKED') {
    return {
      allowed: false,
      reason: customer.lockReason || 'Account is locked due to payment issues',
      accountStatus: customer.accountStatus,
      requiresOverride: true,
    };
  }

  if (customer.accountStatus === 'SUSPENDED') {
    return {
      allowed: false,
      reason: 'Account is suspended. Please contact support.',
      accountStatus: customer.accountStatus,
      requiresOverride: true,
    };
  }

  return {
    allowed: true,
    accountStatus: customer.accountStatus,
  };
}

export async function lockCustomerAccount(
  customerId: string,
  reason: string,
  performedById: string
) {
  return await prisma.$transaction([
    prisma.customer.update({
      where: { id: customerId },
      data: {
        accountStatus: 'LOCKED',
        paymentStatus: 'DELINQUENT',
        lockReason: reason,
        lockedAt: new Date(),
        lockedBy: performedById,
      },
    }),
    prisma.accountLockHistory.create({
      data: {
        customerId,
        action: 'LOCKED',
        reason,
        performedById,
      },
    }),
    prisma.auditEvent.create({
      data: {
        userId: performedById,
        action: 'CUSTOMER_ACCOUNT_LOCKED',
        details: {
          customerId,
          reason,
        },
      },
    }),
  ]);
}

export async function unlockCustomerAccount(
  customerId: string,
  reason: string,
  performedById: string
) {
  return await prisma.$transaction([
    prisma.customer.update({
      where: { id: customerId },
      data: {
        accountStatus: 'ACTIVE',
        paymentStatus: 'CURRENT',
        lockReason: null,
        lockedAt: null,
        lockedBy: null,
      },
    }),
    prisma.accountLockHistory.create({
      data: {
        customerId,
        action: 'UNLOCKED',
        reason,
        performedById,
      },
    }),
    prisma.auditEvent.create({
      data: {
        userId: performedById,
        action: 'CUSTOMER_ACCOUNT_UNLOCKED',
        details: {
          customerId,
          reason,
        },
      },
    }),
  ]);
}

export async function canUserOverrideLock(userRole: string): boolean {
  return ['SUPER_ADMIN', 'FINANCE_ADMIN', 'OPERATOR_ADMIN'].includes(userRole);
}

export async function withPaymentCheck(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getServerSession(req, res, authOptions);

    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const customerId = req.body.customerId || req.query.customerId;

    if (customerId) {
      const paymentStatus = await checkCustomerPaymentStatus(customerId as string);

      if (!paymentStatus.allowed) {
        // Check if user can override
        const canOverride = await canUserOverrideLock(session.user.role);

        if (req.body.overridePaymentLock && canOverride) {
          // Log the override
          await prisma.accountLockHistory.create({
            data: {
              customerId: customerId as string,
              action: 'OVERRIDE',
              reason: req.body.overrideReason || 'Manual override by authorized user',
              performedById: session.user.id,
            },
          });
        } else {
          return res.status(403).json({
            error: paymentStatus.reason,
            accountStatus: paymentStatus.accountStatus,
            requiresOverride: paymentStatus.requiresOverride,
            canOverride,
          });
        }
      }
    }

    return handler(req, res);
  };
}
