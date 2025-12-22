import type { NextApiRequest, NextApiResponse } from 'next';
import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await hash(password, 12);

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
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Failed to create account' });
  }
}