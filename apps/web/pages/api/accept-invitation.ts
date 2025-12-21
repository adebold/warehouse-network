import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { acceptInvitationSchema } from '../../lib/schemas';
import bcrypt from 'bcryptjs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    try {
      const validation = acceptInvitationSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues });
      }

      const { token, name, password } = validation.data;

      const invitation = await prisma.invitation.findUnique({
        where: { token },
      });

      if (!invitation || invitation.expires < new Date()) {
        return res.status(400).json({ message: 'Invalid or expired invitation.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          name,
          email: invitation.email,
          password: hashedPassword,
          role: invitation.role,
        },
      });

      await prisma.invitation.delete({
        where: { id: invitation.id },
      });

      res.status(201).json({ message: 'Account created successfully.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'An unexpected error occurred.' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
