import type { NextApiRequest, NextApiResponse } from 'next'
import { runDailyAccrual } from '@warehouse-network/core/src/accrual'

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
