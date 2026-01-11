
import crypto from 'crypto';

import { getServerSession } from 'next-auth/next';
import { z } from 'zod';

import prisma from '../../../lib/prisma';
import { authOptions } from '../auth/[...nextauth]';
import { logger } from '@/lib/logger';


const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['WAREHOUSE_STAFF', 'FINANCE_ADMIN']),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions);

    if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    try {
      const validation = inviteSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      const { email, role } = validation.data;

      // TODO: This needs to be updated when proper User-Operator relationship is established
      // For now, we'll find an operator based on the user's email
      const operators = await prisma.operator.findMany({
        where: { primaryContact: session.user.email ?? '' },
      });

      if (operators.length === 0) {
        return res.status(404).json({ message: 'Operator not found for this user.' });
      }

      const operatorId = operators[0].id;
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      const invitation = await prisma.invitation.create({
        data: {
          email,
          role,
          token,
          expires,
          // Note: operatorId relationship not tracked in current Invitation model
        },
      });

      // TODO: Send email with invitation link
      logger.info(`Sending invitation to ${email} with token ${token}`);

      res.status(201).json(invitation);
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
