import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import prisma from '../../../lib/prisma'

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
      // TODO: This needs to be updated when proper User-Operator relationship is established
      // For now, we'll find an operator based on the user's email or other identifier
      const operators = await prisma.operator.findMany({
        where: { primaryContact: session.user.email ?? '' },
      })

      if (operators.length === 0) {
        return res.status(404).json({ message: 'Operator not found for this user.' })
      }

      const operator = await prisma.operator.update({
        where: { id: operators[0].id },
        data: {
          termsAccepted: true,
          termsAcceptedAt: new Date(),
        },
      })

      res.status(200).json({ message: 'Terms accepted successfully.' })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['PUT'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
