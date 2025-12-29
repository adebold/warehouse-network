
import { getServerSession } from 'next-auth/next';

import prisma from '../../../lib/prisma';
import { receivingOrderSchema } from '../../../lib/schemas';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions);

    if (
      !session ||
      (session.user?.role !== 'OPERATOR_ADMIN' && session.user?.role !== 'WAREHOUSE_STAFF')
    ) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (!session.user.warehouseId) {
      return res.status(400).json({ message: 'You are not associated with a warehouse.' });
    }

    try {
      const validation = receivingOrderSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      const { customerId, carrier, expectedSkidCount, notes } = validation.data;

      const reference = `RO-${Date.now()}`; // Simple reference for now

      const receivingOrder = await prisma.receivingOrder.create({
        data: {
          reference,
          warehouseId: session.user.warehouseId,
          customerId,
          carrier,
          expectedSkidCount,
          notes,
        },
      });

      res.status(201).json(receivingOrder);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
