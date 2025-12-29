
import crypto from 'crypto';

import { getServerSession } from 'next-auth/next';

import prisma from '../../../lib/prisma';
import { generateReferralCodeSchema } from '../../../lib/schemas';
import { authOptions } from '../auth/[...nextauth]';
import { logger } from './utils/logger';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions);

    if (!session || !session.user?.id) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    try {
      const validation = generateReferralCodeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      const { referralType } = validation.data;

      const referralCode = crypto.randomBytes(8).toString('hex');

      const referral = await prisma.referral.create({
        data: {
          code: referralCode,
          referrerId: session.user.id,
          // refereeId will be set when the referee signs up
          referralType,
          source: 'link', // Assuming a link-based referral
          status: 'PENDING',
          // Optionally add an expiry for the referral code itself
        },
      });

      const referralLink = `${process.env.NEXTAUTH_URL}/signup?referralCode=${referralCode}`;

      res.status(201).json({ referralCode, referralLink });
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
