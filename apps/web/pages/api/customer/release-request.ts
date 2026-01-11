import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '../auth/[...nextauth]';

import { withAccountLockCheck } from '@/lib/middleware/accountLock';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.customerId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    try {
      const { skidIds, deliveryAddress } = req.body;

      if (!skidIds || skidIds.length === 0 || !deliveryAddress) {
        return res.status(400).json({ message: 'Invalid request data' });
      }

      // Verify all skids belong to the customer and are available
      const skids = await prisma.skid.findMany({
        where: {
          id: { in: skidIds },
          customerId: session.user.customerId,
          status: 'STORED',
        },
      });

      if (skids.length !== skidIds.length) {
        return res.status(400).json({
          message: 'Some skids are not available or do not belong to your account',
        });
      }

      // Create the release request
      const releaseRequest = await prisma.releaseRequest.create({
        data: {
          customerId: session.user.customerId,
          status: 'PENDING',
          requestedBy: session.user.id,
          deliveryAddress,
          skids: {
            connect: skidIds.map((id: string) => ({ id })),
          },
        },
        include: {
          skids: true,
        },
      });

      // Update skid status
      await prisma.skid.updateMany({
        where: { id: { in: skidIds } },
        data: { status: 'PENDING_RELEASE' },
      });

      return res.status(201).json({
        message: 'Release request created successfully',
        releaseRequest,
      });
    } catch (error) {
      logger.error('Error creating release request:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

// Export with account lock check middleware
export default withAccountLockCheck(handler, 'RELEASE');
