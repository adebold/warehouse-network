import type { Customer } from '@warehouse/types';

import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../auth/[...nextauth]';
import prisma from '@/lib/prisma';
import { sendAccountLockNotification } from '@/lib/notifications/accountNotifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { id } = req.query;

  if (req.method === 'POST') {
    try {
      const { action, reason, overrideReason } = req.body;

      if (!['lock', 'unlock'].includes(action)) {
        return res.status(400).json({ message: 'Invalid action' });
      }

      // Get the current customer
      const customer = await prisma.customer.findUnique({
        where: { id: String(id) },
      });

      if (!customer) {
        return res.status(404).json({ message: 'Customer not found' });
      }

      // Update customer account status
      const updatedCustomer = await prisma.customer.update({
        where: { id: String(id) },
        data: {
          accountStatus: action === 'lock' ? 'LOCKED' : 'ACTIVE',
          lockReason: action === 'lock' ? reason : null,
          lockedAt: action === 'lock' ? new Date() : null,
          lockedBy: action === 'lock' ? session.user.id : null,
        },
      });

      // Create lock history entry
      await prisma.accountLockHistory.create({
        data: {
          customerId: String(id),
          action: action === 'lock' ? 'LOCKED' : 'UNLOCKED',
          reason: reason || null,
          performedById: session.user.id,
          overrideReason: overrideReason || null,
          metadata: {
            previousStatus: customer.accountStatus,
            userRole: session.user.role,
            ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
          },
        },
      });

      // Send notification
      const performedByUser = await prisma.user.findUnique({
        where: { id: session.user.id },
      });

      if (performedByUser) {
        await sendAccountLockNotification({
          customer: updatedCustomer,
          action: action === 'lock' ? 'LOCKED' : 'UNLOCKED',
          reason: reason || undefined,
          performedBy: performedByUser,
        });
      }

      // If locking, check for active operations and send notifications
      if (action === 'lock') {
        // Check for pending release requests
        const pendingReleases = await prisma.releaseRequest.count({
          where: {
            customerId: String(id),
            status: 'PENDING',
          },
        });

        // Check for active skids
        const activeSkids = await prisma.skid.count({
          where: {
            customerId: String(id),
            status: { in: ['STORED', 'RECEIVING'] },
          },
        });

        // TODO: Send notification to customer about account lock
        // TODO: Notify warehouse operators about the lock

        return res.status(200).json({
          customer: updatedCustomer,
          warnings: {
            pendingReleases,
            activeSkids,
          },
        });
      }

      return res.status(200).json({ customer: updatedCustomer });
    } catch (error) {
      console.error('Error updating customer lock status:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
