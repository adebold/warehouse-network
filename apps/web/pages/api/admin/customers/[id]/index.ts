import { NextApiRequest, NextApiResponse } from 'next'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../../auth/[...nextauth]'
import prisma from '@/lib/prisma'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions)

  if (!session || (session.user.role !== 'admin' && session.user.role !== 'operator')) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const { id } = req.query

  if (req.method === 'GET') {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: String(id) },
        include: {
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            }
          },
          _count: {
            select: {
              skids: true,
              rfqs: true,
              disputes: true,
              deposits: true,
              releaseRequests: true,
            }
          },
          lockHistory: {
            orderBy: {
              timestamp: 'desc'
            },
            take: 10,
            include: {
              performedBy: {
                select: {
                  name: true,
                  email: true,
                }
              }
            }
          },
          skids: {
            where: {
              status: {
                in: ['STORED', 'RECEIVING']
              }
            },
            select: {
              id: true,
              trackingNumber: true,
              status: true,
              weight: true,
              createdAt: true,
            },
            take: 5,
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      })

      if (!customer) {
        return res.status(404).json({ message: 'Customer not found' })
      }

      return res.status(200).json(customer)
    } catch (error) {
      console.error('Error fetching customer:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  } else if (req.method === 'PATCH') {
    try {
      const { paymentStatus, paymentDueDate, overdueAmount, totalOutstanding } = req.body

      const updatedCustomer = await prisma.customer.update({
        where: { id: String(id) },
        data: {
          paymentStatus,
          paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : undefined,
          overdueAmount,
          totalOutstanding,
        }
      })

      return res.status(200).json(updatedCustomer)
    } catch (error) {
      console.error('Error updating customer:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  } else {
    res.setHeader('Allow', ['GET', 'PATCH'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}