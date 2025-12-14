import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import prisma from '@warehouse-network/db/src/client'
import { rfqSchema } from '../../lib/schemas'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions)

    if (!session || session.user?.role !== 'CUSTOMER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    if (!session.user.customerId) {
      return res.status(400).json({ message: 'You are not associated with a customer.'})
    }

    try {
      const validation = rfqSchema.safeParse(req.body)
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues })
      }

      const { preferredWarehouseIds, estimatedSkidCount, footprintType, expectedInboundDate, expectedDuration, specialHandlingNotes } = validation.data

      const rfq = await prisma.rFQ.create({
        data: {
          customerId: session.user.customerId,
          preferredWarehouseIds: preferredWarehouseIds.join(','), // Store as comma-separated string for simplicity
          estimatedSkidCount,
          footprintType,
          expectedInboundDate: new Date(expectedInboundDate),
          expectedDuration,
          specialHandlingNotes,
          status: 'PENDING',
        },
      })

      res.status(201).json(rfq)
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
