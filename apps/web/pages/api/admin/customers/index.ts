import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../auth/[...nextauth]'
import prisma from '@/lib/prisma'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions)

  if (!session || session.user.role !== 'admin') {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    try {
      const customers = await prisma.customer.findMany({
        include: {
          _count: {
            select: {
              skids: true,
              rfqs: true,
              disputes: true,
              deposits: true,
            }
          }
        },
        orderBy: {
          name: 'asc'
        }
      })

      return res.status(200).json(customers)
    } catch (error) {
      console.error('Error fetching customers:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  } else {
    res.setHeader('Allow', ['GET'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}