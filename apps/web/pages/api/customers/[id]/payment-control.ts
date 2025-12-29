import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';

import {
  lockCustomerAccount,
  unlockCustomerAccount,
} from '@/lib/payment-control';
import prisma from '@/lib/prisma';
import { authOptions } from '@/pages/api/auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id: customerId } = req.query;

  if (typeof customerId !== 'string') {
    return res.status(400).json({ error: 'Invalid customer ID' });
  }

  // Check if user has permission to manage payment controls
  const hasPermission = [
    'SUPER_ADMIN',
    'FINANCE_ADMIN',
    'OPERATOR_ADMIN',
    'WAREHOUSE_STAFF',
  ].includes(session.user.role);

  if (!hasPermission) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  switch (req.method) {
    case 'GET':
      // Get current payment control status
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          name: true,
          accountStatus: true,
          paymentStatus: true,
          lockReason: true,
          lockedAt: true,
          lockedBy: true,
          overdueAmount: true,
          totalOutstanding: true,
          paymentDueDate: true,
          lockHistory: {
            include: {
              performedBy: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: {
              timestamp: 'desc',
            },
            take: 10,
          },
        },
      });

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      return res.status(200).json(customer);

    case 'POST':
      // Lock/Unlock account
      const { action, reason, updatePaymentInfo } = req.body;

      if (!['lock', 'unlock', 'updatePayment'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
      }

      if ((action === 'lock' || action === 'unlock') && !reason) {
        return res.status(400).json({ error: 'Reason is required' });
      }

      try {
        if (action === 'lock') {
          await lockCustomerAccount(customerId, reason, session.user.id);
          return res.status(200).json({ success: true, message: 'Account locked successfully' });
        } else if (action === 'unlock') {
          await unlockCustomerAccount(customerId, reason, session.user.id);
          return res.status(200).json({ success: true, message: 'Account unlocked successfully' });
        } else if (action === 'updatePayment') {
          // Update payment information
          const { paymentStatus, overdueAmount, totalOutstanding, paymentDueDate } =
            updatePaymentInfo;

          await prisma.customer.update({
            where: { id: customerId },
            data: {
              paymentStatus,
              overdueAmount,
              totalOutstanding,
              paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
            },
          });

          await prisma.auditEvent.create({
            data: {
              userId: session.user.id,
              action: 'PAYMENT_INFO_UPDATED',
              details: {
                customerId,
                updatePaymentInfo,
              },
            },
          });

          return res.status(200).json({ success: true, message: 'Payment information updated' });
        }
      } catch (error) {
        console.error('Error updating payment control:', error);
        return res.status(500).json({ error: 'Failed to update payment control' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
