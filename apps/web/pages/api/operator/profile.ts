import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import prisma from '@warehouse-network/db/src/client'
import { operatorProfileSchema } from '../../lib/schemas'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'PUT') {
    const session = await getServerSession(req, res, authOptions)

    if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    try {
      const validation = operatorProfileSchema.safeParse(req.body)
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues })
      }

      const user = await prisma.user.findUnique({
        where: { email: session.user.email ?? '' },
        include: { operatorUser: true },
      })

      if (!user?.operatorUser) {
        return res.status(404).json({ message: 'Operator not found for this user.' })
      }

      const updatedOperator = await prisma.operator.update({
        where: { id: user.operatorUser.operatorId },
        data: validation.data,
      })

      res.status(200).json(updatedOperator)
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['PUT'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
