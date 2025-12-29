
import { getServerSession } from 'next-auth/next';

import prisma from '../../../../lib/prisma';
import { updateDisputeSchema } from '../../../../lib/schemas';
import { authOptions } from '../../auth/[...nextauth]';
import { logger } from './utils/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    const session = await getServerSession(req, res, authOptions);

    if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    try {
      const validation = updateDisputeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      const { resolution, status } = validation.data;

      const dispute = await prisma.dispute.findUnique({
        where: { id: String(id) },
      });

      if (!dispute || dispute.operatorId !== session.user.operatorId) {
        return res.status(404).json({ message: 'Dispute not found.' });
      }

      const updatedDispute = await prisma.dispute.update({
        where: { id: String(id) },
        data: {
          resolution,
          status,
          resolvedAt: status === 'RESOLVED' ? new Date() : undefined,
        },
      });

      res.status(200).json(updatedDispute);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
