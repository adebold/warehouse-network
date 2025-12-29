
import { getServerSession } from 'next-auth/next';

import prisma from '../../../../lib/prisma';
import { updateQuoteStatusSchema } from '../../../../lib/schemas';
import { authOptions } from '../../auth/[...nextauth]';
import { logger } from './utils/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (req.method === 'PUT') {
    const session = await getServerSession(req, res, authOptions);

    if (
      !session ||
      (session.user?.role !== 'CUSTOMER_ADMIN' && session.user?.role !== 'CUSTOMER_USER')
    ) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    try {
      const validation = updateQuoteStatusSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      const { status } = validation.data;

      const quote = await prisma.quote.findUnique({
        where: { id: String(id) },
        include: { rfq: true },
      });

      if (!quote || quote.rfq.customerId !== session.user.customerId) {
        return res.status(404).json({ message: 'Quote not found.' });
      }

      const updatedQuote = await prisma.quote.update({
        where: { id: String(id) },
        data: { status },
      });

      res.status(200).json(updatedQuote);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['PUT']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
