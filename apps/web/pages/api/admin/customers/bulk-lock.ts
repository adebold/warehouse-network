
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '../../auth/[...nextauth]';

import { sendAccountLockNotification } from '@/lib/notifications/accountNotifications';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session || session.user.role !== 'admin') {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    try {
      const { customerIds, action, reason } = req.body;

      if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
        return res.status(400).json({ message: 'Invalid customer IDs' });
      }

      if (!['lock', 'unlock'].includes(action)) {
        return res.status(400).json({ message: 'Invalid action' });
      }

      if (!reason) {
        return res.status(400).json({ message: 'Reason is required' });
      }

      // Get the user performing the action
      const performedByUser = await prisma.user.findUnique({
        where: { id: session.user.id },
      });

      if (!performedByUser) {
        return res.status(400).json({ message: 'User not found' });
      }

      // Perform bulk update
      const updateData = {
        accountStatus: action === 'lock' ? 'LOCKED' : 'ACTIVE',
        lockReason: action === 'lock' ? reason : null,
        lockedAt: action === 'lock' ? new Date() : null,
        lockedBy: action === 'lock' ? session.user.id : null,
      };

      // Update all customers
      const updateResult = await prisma.customer.updateMany({
        where: { id: { in: customerIds } },
        data: updateData,
      });

      // Get updated customers for notifications
      const updatedCustomers = await prisma.customer.findMany({
        where: { id: { in: customerIds } },
      });

      // Create lock history entries and send notifications for each customer
      const historyPromises = updatedCustomers.map(async customer => {
        // Create history entry
        await prisma.accountLockHistory.create({
          data: {
            customerId: customer.id,
            action: action === 'lock' ? 'LOCKED' : 'UNLOCKED',
            reason: reason,
            performedById: session.user.id,
            metadata: {
              bulkOperation: true,
              totalCustomers: customerIds.length,
              userRole: session.user.role,
              ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            },
          },
        });

        // Send notification
        await sendAccountLockNotification({
          customer,
          action: action === 'lock' ? 'LOCKED' : 'UNLOCKED',
          reason,
          performedBy: performedByUser,
        });
      });

      await Promise.all(historyPromises);

      // Check for active operations if locking
      let warnings = {};
      if (action === 'lock') {
        const activeSkids = await prisma.skid.groupBy({
          by: ['customerId'],
          where: {
            customerId: { in: customerIds },
            status: { in: ['STORED', 'RECEIVING'] },
          },
          _count: true,
        });

        const pendingReleases = await prisma.releaseRequest.groupBy({
          by: ['customerId'],
          where: {
            customerId: { in: customerIds },
            status: 'PENDING',
          },
          _count: true,
        });

        warnings = {
          activeSkids: activeSkids.reduce((sum, item) => sum + item._count, 0),
          pendingReleases: pendingReleases.reduce((sum, item) => sum + item._count, 0),
        };
      }

      return res.status(200).json({
        updated: updateResult.count,
        action,
        warnings,
      });
    } catch (error) {
      logger.error('Error performing bulk lock operation:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
