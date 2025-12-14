import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

// Daily accrual logic - simplified implementation
async function runDailyAccrual() {
  // TODO: Implement daily accrual logic for warehouse charges
  // This would typically process daily storage charges for active skids
  console.log('Running daily accrual job...')
  
  // Example: Find all active skids and create daily storage charges
  const activeSkids = await prisma.skid.findMany({
    where: { status: { in: ['STORED', 'PUTAWAY'] } },
    include: { warehouse: true }
  })
  
  console.log(`Processing ${activeSkids.length} active skids for daily accrual`)
  // Accrual logic would go here
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    const { authorization } = req.headers

    if (authorization !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    try {
      await runDailyAccrual()
      res.status(200).json({ message: 'Daily accrual job initiated successfully.' })
    } catch (error) {
      console.error(error)
      res.status(500).json({ message: 'An unexpected error occurred during accrual.' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
