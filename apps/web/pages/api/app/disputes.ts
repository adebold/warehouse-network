import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';

import prisma from '../../../lib/prisma';
import { disputeSchema } from '../../../lib/schemas';
import { authOptions } from '../auth/[...nextauth]';
import { logger } from '@/lib/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions);

    if (!session || session.user?.role !== 'CUSTOMER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (!session.user.customerId) {
      return res.status(400).json({ message: 'You are not associated with a customer.' });
    }

    try {
      const validation = disputeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      const { type, description, skidIds, evidence } = validation.data;

      const skids = await prisma.skid.findMany({
        where: { id: { in: skidIds }, customerId: session.user.customerId },
      });

      if (skids.length !== skidIds.length) {
        return res.status(400).json({ message: 'Invalid skid selection.' });
      }

      // Assuming all skids in a dispute belong to the same operator/warehouse for simplicity
      // In a more complex scenario, this would need to handle disputes across multiple operators/warehouses
      const warehouseId = skids[0].warehouseId;
      const operator = await prisma.operator.findFirst({
        where: { warehouses: { some: { id: warehouseId } } },
      });
      if (!operator) {
        return res.status(400).json({ message: 'Operator not found for selected warehouse.' });
      }

      const dispute = await prisma.dispute.create({
        data: {
          customerId: session.user.customerId,
          operatorId: operator.id,
          type,
          description,
          evidence: evidence ? JSON.parse(evidence) : undefined, // Store evidence as JSON
          skids: {
            create: skidIds.map(skidId => ({ skidId })),
          },
        },
      });

      res.status(201).json(dispute);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
