import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';
import { releaseRequestSchema } from '../../../lib/schemas';

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
      const validation = releaseRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      const { requestedAt, carrierDetails, skidIds } = validation.data;

      const skids = await prisma.skid.findMany({
        where: { id: { in: skidIds }, customerId: session.user.customerId },
      });

      if (skids.length !== skidIds.length) {
        return res.status(400).json({ message: 'Invalid skid selection.' });
      }

      const warehouseId = skids[0].warehouseId;

      const releaseRequest = await prisma.releaseRequest.create({
        data: {
          requestedAt: new Date(requestedAt),
          carrierDetails,
          customerId: session.user.customerId,
          warehouseId,
          skids: {
            create: skidIds.map(skidId => ({ skidId })),
          },
        },
      });

      await prisma.skid.updateMany({
        where: { id: { in: skidIds } },
        data: { status: 'PICKING' },
      });

      res.status(201).json(releaseRequest);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
