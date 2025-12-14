import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../../lib/prisma'
import { applicationReviewSchema } from '../../../../lib/schemas'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { id } = req.query

  if (req.method === 'PUT') {
    try {
      const validation = applicationReviewSchema.safeParse(req.body)
      if (!validation.success) {
        return res.status(400).json({ errors: validation.error.issues })
      }

      const { status } = validation.data

      // TODO: Add RBAC to ensure only admins can do this

      const updatedOperator = await prisma.operator.update({
        where: { id: String(id) },
        data: { status },
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
