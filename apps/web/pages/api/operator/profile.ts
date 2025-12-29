
import { getServerSession } from 'next-auth/next';

import prisma from '../../../lib/prisma';
import { operatorProfileSchema } from '../../../lib/schemas';
import { authOptions } from '../auth/[...nextauth]';
import { logger } from './utils/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'PUT') {
    const session = await getServerSession(req, res, authOptions);

    if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    try {
      const validation = operatorProfileSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      // TODO: This needs to be updated when proper User-Operator relationship is established
      // For now, we'll find an operator based on the user's email
      const operators = await prisma.operator.findMany({
        where: { primaryContact: session.user.email ?? '' },
      });

      if (operators.length === 0) {
        return res.status(404).json({ message: 'Operator not found for this user.' });
      }

      const updatedOperator = await prisma.operator.update({
        where: { id: operators[0].id },
        data: validation.data,
      });

      res.status(200).json(updatedOperator);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
