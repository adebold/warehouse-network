import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import prisma from '../../../../lib/prisma';
// TODO: Stripe integration - package not installed
// This endpoint would handle Stripe Connect onboarding for operators

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions);

    if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    try {
      // TODO: Implement Stripe Connect onboarding when Stripe package is installed
      // This would create or retrieve a Stripe Connect account for the operator

      res.status(501).json({
        message: 'Stripe Connect onboarding not implemented yet',
        todo: 'Install stripe package and implement Connect flow',
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
