import { hash } from 'bcryptjs';
import type { NextApiRequest, NextApiResponse } from 'next';

import { securityConfig, validatePassword } from '@/lib/config/security';
import { withCSRFProtection } from '@/lib/middleware/csrf';
import { withAuthSecurity } from '@/lib/middleware/security';
import prisma from '@/lib/prisma';
import { logger } from './utils/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Validate password against security policy
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({ 
      message: 'Password does not meet security requirements',
      errors: passwordValidation.errors
    });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password with configurable rounds
    const hashedPassword = await hash(password, securityConfig.auth.bcryptRounds);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        roleType: 'TENANT',
      },
    });

    // Don't send password back
    const { password: _, ...userWithoutPassword } = user;

    return res.status(201).json({
      message: 'Account created successfully',
      user: userWithoutPassword,
    });
  } catch (error) {
    logger.error('Registration error:', error);
    return res.status(500).json({ message: 'Failed to create account' });
  }
}

// Export with security middleware applied
export default withCSRFProtection(withAuthSecurity(handler));