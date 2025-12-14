import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'
import prisma from '@warehouse-network/db/src/client'
import { quoteSchema } from '../../lib/schemas'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const session = await getServerSession(req, res, authOptions)

    if (!session || session.user?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    try {
      const validation = quoteSchema.safeParse(req.body)
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues })
      }

      const { rfqId, warehouseId, items, currency, assumptions, guaranteedCharges, depositAmount, accrualStartRule, expiryDate } = validation.data

      const quote = await prisma.quote.create({
        data: {
          rfqId,
          warehouseId,
          currency,
          assumptions,
          guaranteedCharges,
          depositAmount,
          accrualStartRule,
          expiryDate: new Date(expiryDate),
          items: {
            create: items.map(item => ({
              chargeCategory: item.chargeCategory,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              description: item.description,
            })),
          },
        },
        include: { items: true },
      })

      await prisma.rFQ.update({
        where: { id: rfqId },
        data: { status: 'QUOTED' },
      })

      res.status(201).json(quote)
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
