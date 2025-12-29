
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '../auth/[...nextauth]';

import prisma from '@/lib/prisma';
import { logger } from './utils/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session || !session.user.customerId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: session.user.customerId },
        select: {
          id: true,
          name: true,
          accountStatus: true,
          paymentStatus: true,
          lockReason: true,
          lockedAt: true,
          paymentDueDate: true,
          overdueAmount: true,
          totalOutstanding: true,
        },
      });

      if (!customer) {
        return res.status(404).json({ message: 'Customer not found' });
      }

      return res.status(200).json(customer);
    } catch (error) {
      logger.error('Error fetching customer account:', error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
