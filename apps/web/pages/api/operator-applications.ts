import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { operatorApplicationSchema } from '../../lib/schemas'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    try {
      const validation = operatorApplicationSchema.safeParse(req.body)
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues })
      }

      const {
        legalName,
        registrationDetails,
        primaryContact,
        operatingRegions,
        warehouseCount,
        goodsCategories,
        insurance,
      } = validation.data

      // TODO: Assumes a single platform, create it if it doesn't exist
      let platform = await prisma.platform.findFirst();
      if (!platform) {
        platform = await prisma.platform.create({
          data: { name: 'Default Platform' },
        });
      }

      const operator = await prisma.operator.create({
        data: {
          legalName,
          registrationDetails,
          primaryContact,
          operatingRegions,
          warehouseCount,
          goodsCategories,
          insuranceAcknowledged: insurance,
          platformId: platform.id,
        },
      })

      res.status(201).json(operator)
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred.' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
