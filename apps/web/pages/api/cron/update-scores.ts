import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '@warehouse-network/db/src/client'
import { calculateOperatorTrustScore, calculateWarehouseQualityScore } from '@warehouse-network/core/src/scoring'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const { authorization } = req.headers

    if (authorization !== `Bearer ${process.env.CRON_SECRET_SCORES}`) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    try {
      const operators = await prisma.operator.findMany()
      for (const operator of operators) {
        await calculateOperatorTrustScore(operator.id)
      }

      const warehouses = await prisma.warehouse.findMany()
      for (const warehouse of warehouses) {
        await calculateWarehouseQualityScore(warehouse.id)
      }

      res.status(200).json({ message: 'Scores updated successfully.' })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred during score update.' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
