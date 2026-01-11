
import { ReferralType, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { NextApiRequest, NextApiResponse } from 'next';

import prisma from '../../../lib/prisma';
import { registerWithReferralSchema } from '../../../lib/schemas';

import { securityConfig, validatePassword } from '@/lib/config/security';
import { withCSRFProtection } from '@/lib/middleware/csrf';
import { withAuthSecurity } from '@/lib/middleware/security';
import { logger } from '@/lib/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const validation = registerWithReferralSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      const { referralCode, email, name, password } = validation.data;

      const referral = await prisma.referral.findUnique({
        where: { code: referralCode },
      });

      if (!referral) {
        return res.status(400).json({ message: 'Invalid referral code.' });
      }

      if (referral.status !== 'PENDING') {
        return res.status(400).json({ message: 'Referral code already used or expired.' });
      }

      // Check for self-referral
      const referrer = await prisma.user.findUnique({ where: { id: referral.referrerId } });
      if (referrer?.email === email) {
        return res.status(400).json({ message: 'Self-referral is not allowed.' });
      }

      // Validate password against security policy
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ 
          message: 'Password does not meet security requirements',
          errors: passwordValidation.errors
        });
      }

      const hashedPassword = await bcrypt.hash(password, securityConfig.auth.bcryptRounds);

      let userRole: UserRole;
      if (referral.referralType === ReferralType.CUSTOMER_TO_CUSTOMER) {
        userRole = UserRole.CUSTOMER_USER;
      } else if (referral.referralType === ReferralType.OPERATOR_TO_OPERATOR) {
        userRole = UserRole.OPERATOR_ADMIN; // New operator is always an admin
      } else if (referral.referralType === ReferralType.OPERATOR_TO_CUSTOMER) {
        userRole = UserRole.CUSTOMER_USER;
      } else {
        userRole = UserRole.CUSTOMER_USER;
      }

      const newUser = await prisma.user.create({
        data: {
          email,
          name,
          password: hashedPassword,
          role: userRole,
        },
      });

      await prisma.referral.update({
        where: { id: referral.id },
        data: {
          refereeId: newUser.id,
          status: 'QUALIFIED',
          qualifiedAt: new Date(),
        },
      });

      // TODO: Apply referral rewards (credits)
      // await prisma.credit.create(...)

      res.status(201).json({ message: 'Account created successfully with referral.' });
    } catch (error) {
      logger.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

// Export with security middleware applied
export default withCSRFProtection(withAuthSecurity(handler));
