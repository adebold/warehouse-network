import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../../../auth/[...nextauth]'
import prisma from '@warehouse-network/db/src/client'
import { generateSkidsSchema } from '../../../../../../lib/schemas'
import { generateSkidCode } from '@warehouse-network/core/src/skid'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query

  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions)

    if (!session || (session.user?.role !== 'OPERATOR_ADMIN' && session.user?.role !== 'WAREHOUSE_STAFF')) {
      return res.status(403).json({ message: 'Forbidden' })
    }

    try {
      const validation = generateSkidsSchema.safeParse(req.body)
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues })
      }

      const { numberOfSkids } = validation.data

      const receivingOrder = await prisma.receivingOrder.findUnique({
        where: { id: String(id) },
      })

      if (!receivingOrder) {
        return res.status(404).json({ message: 'Receiving order not found.' })
      }

      const skids = []
      for (let i = 0; i < numberOfSkids; i++) {
        const skid = await prisma.skid.create({
          data: {
            skidCode: generateSkidCode(receivingOrder.reference, i + 1),
            customerId: receivingOrder.customerId,
            warehouseId: receivingOrder.warehouseId,
            receivingOrderId: receivingOrder.id,
            status: 'RECEIVED',
          },
        })
        skids.push(skid)
      }

      res.status(201).json(skids)
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
