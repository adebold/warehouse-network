import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import prisma from '@warehouse-network/db/src/client'
import { z } from 'zod'
import crypto from 'crypto'

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['WAREHOUSE_STAFF', 'FINANCE_ADMIN']),
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions)

    if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    try {
      const validation = inviteSchema.safeParse(req.body)
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues })
      }

      const { email, role } = validation.data

      const user = await prisma.user.findUnique({
        where: { email: session.user.email ?? '' },
        include: { operatorUser: true },
      })

      if (!user?.operatorUser) {
        return res.status(404).json({ message: 'Operator not found for this user.' })
      }

      const operatorId = user.operatorUser.operatorId
      const token = crypto.randomBytes(32).toString('hex')
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

      const invitation = await prisma.invitation.create({
        data: {
          email,
          role,
          token,
          expires,
          operatorId,
        },
      })

      // TODO: Send email with invitation link
      console.log(`Sending invitation to ${email} with token ${token}`)

      res.status(201).json(invitation)
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
