import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../../auth/[...nextauth]'
import prisma from '@warehouse-network/db/src/client'
import { pricingRulesSchema } from '../../../../../lib/schemas'
import { createOrUpdateCityPageForWarehouse } from '@warehouse-network/core/src/seo'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query

  if (req.method === 'PUT') {
    const session = await getServerSession(req, res, authOptions)

    if (!session || session.user?.role !== 'OPERATOR_ADMIN') {
      return res.status(403).json({ message: 'Forbidden' })
    }

    try {
      const validation = pricingRulesSchema.safeParse(req.body)
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
      
      const warehouse = await prisma.warehouse.findFirst({
        where: { id: String(id), operatorId: user.operatorUser.operatorId },
      })

      if (!warehouse) {
        return res.status(404).json({ message: 'Warehouse not found.'})
      }

      await prisma.pricingRule.deleteMany({
        where: { warehouseId: String(id) },
      })

      const newPricingRules = await prisma.pricingRule.createMany({
        data: Object.entries(validation.data).map(([category, price]) => ({
          warehouseId: String(id),
          chargeCategory: category as any,
          price,
        })),
      })
      
      // Also update warehouse status to READY_FOR_MARKETPLACE
      await prisma.warehouse.update({
        where: { id: String(id) },
        data: { status: 'READY_FOR_MARKETPLACE' },
      })
      
      await createOrUpdateCityPageForWarehouse(String(id))

      res.status(200).json(newPricingRules)
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['PUT'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
