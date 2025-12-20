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
      // Get all customers with overdue payments
      const overdueCustomers = await prisma.customer.findMany({
        where: {
          OR: [
            { paymentStatus: 'OVERDUE' },
            { paymentStatus: 'DELINQUENT' }
          ]
        },
        select: {
          id: true,
          name: true,
          accountStatus: true,
          paymentStatus: true,
          overdueAmount: true,
          totalOutstanding: true,
          paymentDueDate: true,
          createdAt: true,
          _count: {
            select: {
              skids: true
            }
          },
          users: {
            select: {
              email: true
            },
            take: 1
          }
        }
      })

      // Calculate days overdue for each customer
      const customersWithDays = overdueCustomers.map(customer => {
        let daysOverdue = 0
        if (customer.paymentDueDate) {
          const dueDate = new Date(customer.paymentDueDate)
          const today = new Date()
          daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        }
        return {
          ...customer,
          daysOverdue
        }
      })

      // Calculate statistics
      const stats = {
        totalOverdue: customersWithDays.length,
        totalAmount: customersWithDays.reduce((sum, c) => sum + c.overdueAmount, 0),
        averageDaysOverdue: customersWithDays.length > 0
          ? customersWithDays.reduce((sum, c) => sum + c.daysOverdue, 0) / customersWithDays.length
          : 0,
        byAgeGroup: {
          '0-30': 0,
          '31-60': 0,
          '61-90': 0,
          '90+': 0
        },
        byStatus: {
          overdue: 0,
          delinquent: 0,
          locked: 0
        }
      }

      // Populate age groups and status counts
      customersWithDays.forEach(customer => {
        // Age groups
        if (customer.daysOverdue <= 30) stats.byAgeGroup['0-30']++
        else if (customer.daysOverdue <= 60) stats.byAgeGroup['31-60']++
        else if (customer.daysOverdue <= 90) stats.byAgeGroup['61-90']++
        else stats.byAgeGroup['90+']++

        // Status counts
        if (customer.paymentStatus === 'OVERDUE') stats.byStatus.overdue++
        if (customer.paymentStatus === 'DELINQUENT') stats.byStatus.delinquent++
        if (customer.accountStatus === 'LOCKED') stats.byStatus.locked++
      })

      return res.status(200).json({
        customers: customersWithDays,
        stats
      })
    } catch (error) {
      console.error('Error fetching overdue report:', error)
      return res.status(500).json({ message: 'Internal server error' })
    }
  } else {
    res.setHeader('Allow', ['GET'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}